'use strict';

const express = require('express');
const db = require('../data/db');
const metrics = require('../metrics/metrics');

const router = express.Router();

const QUEUE_MAX = 1000;
const TASK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_ASSIGN_MS = 30000;     // reap tasks assigned >30s ago
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes
let lastAssignedWorker = null; // fairness: track last worker that got a task

// Idempotency: if x-idempotency-key header is present, return cached response on duplicate
function checkIdempotency(req, res) {
  const key = req.headers['x-idempotency-key'];
  if (!key) return false; // no key = no idempotency check
  // Evict expired keys
  db.prepare("DELETE FROM idempotency WHERE created_at < ?").run(Date.now() - IDEMPOTENCY_TTL_MS);
  const row = db.prepare("SELECT response FROM idempotency WHERE key = ?").get(key);
  if (row) {
    const cached = JSON.parse(row.response);
    res.status(cached._status || 200).json(cached.body);
    return true;
  }
  return false;
}

function saveIdempotency(req, statusCode, body) {
  const key = req.headers['x-idempotency-key'];
  if (!key) return;
  db.prepare(
    "INSERT OR IGNORE INTO idempotency (key, response, created_at) VALUES (?, ?, ?)"
  ).run(key, JSON.stringify({ _status: statusCode, body }), Date.now());
}

// Control state — loaded from DB on startup, kept in sync on every mutation
const control = {
  get paused() {
    return db.prepare("SELECT value FROM control_state WHERE key = 'paused'").get().value === 'true';
  },
  set paused(val) {
    db.prepare("UPDATE control_state SET value = ? WHERE key = 'paused'").run(val ? 'true' : 'false');
  },
};

function evict() {
  const cutoff = Date.now() - TASK_TTL_MS;
  db.prepare(
    "DELETE FROM tasks WHERE status IN ('success', 'failed') AND completed_at < ?"
  ).run(cutoff);
}

// Stale task reaper: requeue tasks stuck in 'assigned' beyond timeout.
// Piggybacked on assign — no background timer, triggered only on API activity.
function reapStaleTasks() {
  const cutoff = Date.now() - STALE_ASSIGN_MS;
  const reaped = db.prepare(
    "UPDATE tasks SET status = 'queued', assigned_at = NULL WHERE status = 'assigned' AND assigned_at < ?"
  ).run(cutoff);
  if (reaped.changes > 0) {
    console.log(`[reaper] requeued ${reaped.changes} stale assigned task(s)`);
  }
}

// Atomic assign: SELECT + UPDATE in a single transaction — safe within one process,
// and WAL mode makes this durable to crash mid-assign
const assignTask = db.transaction(() => {
  const task = db.prepare(
    "SELECT * FROM tasks WHERE status = 'queued' ORDER BY id LIMIT 1"
  ).get();
  if (!task) return null;
  const now = Date.now();
  db.prepare(
    "UPDATE tasks SET status = 'assigned', assigned_at = ? WHERE id = ?"
  ).run(now, task.id);
  return { ...task, status: 'assigned', assignedAt: now };
});

router.post('/submit', (req, res) => {
  if (checkIdempotency(req, res)) return;
  evict();
  const count = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('queued', 'assigned')").get().n;
  if (count >= QUEUE_MAX) {
    return res.status(429).json({ error: 'queue full' });
  }
  const { payload, expected_output } = req.body || {};
  if (payload === undefined) {
    return res.status(400).json({ error: 'payload required' });
  }
  const now = Date.now();
  const result = db.prepare(
    "INSERT INTO tasks (payload, expected_output, status, created_at) VALUES (?, ?, 'queued', ?)"
  ).run(String(payload), expected_output !== undefined ? String(expected_output) : null, now);
  metrics.inc('tasks_submitted');
  const body = { status: 'ok', task_id: result.lastInsertRowid };
  saveIdempotency(req, 200, body);
  metrics.logEvent('submit', { task_id: result.lastInsertRowid });
  res.json(body);
});

router.get('/assign', (req, res) => {
  if (control.paused) {
    // Paused is not a failure — do not increment assign_failures
    return res.status(503).json({ status: 'paused' });
  }
  const workerId = req.headers['x-worker-id'];
  if (metrics.isQuarantined(workerId)) {
    return res.status(403).json({ status: 'quarantined', worker_id: workerId });
  }
  reapStaleTasks();
  try {
    // Fairness: if same worker just got a task, yield once to let others claim work.
    // Only yields if there are queued tasks (so single-worker setups don't starve).
    if (workerId && workerId === lastAssignedWorker) {
      const queued = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'queued'").get().n;
      if (queued > 0) {
        lastAssignedWorker = null; // reset so next call goes through
        return res.json({ status: 'empty' });
      }
    }
    const task = assignTask();
    if (!task) {
      metrics.inc('assign_failures');
      return res.json({ status: 'empty' });
    }
    lastAssignedWorker = workerId || null;
    metrics.inc('tasks_assigned');
    metrics.logEvent('assign', { task_id: task.id, worker_id: workerId || null });
    res.json({ status: 'ok', task });
  } catch (err) {
    metrics.inc('assign_failures');
    throw err;
  }
});

router.post('/validate', (req, res) => {
  const { task_id, output } = req.body || {};
  if (task_id === undefined || task_id === null || !/^\d+$/.test(String(task_id))) {
    metrics.inc('validate_failures');
    return res.status(400).json({ error: 'task_id must be a positive integer' });
  }
  // output must be present — String(undefined) !== null, causing a comparison/storage split
  if (output === undefined) {
    metrics.inc('validate_failures');
    return res.status(400).json({ error: 'output required' });
  }
  const id = parseInt(task_id, 10);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    metrics.inc('validate_failures');
    return res.status(404).json({ error: 'task not found' });
  }
  // Only assigned tasks may be validated — prevents completing a task that was never processed
  if (task.status !== 'assigned') {
    metrics.inc('validate_failures');
    return res.status(409).json({ error: `task is ${task.status}, only assigned tasks can be validated` });
  }
  const outputStr = String(output);
  const success = outputStr === task.expected_output;
  const status = success ? 'success' : 'failed';
  const now = Date.now();
  const info = db.prepare(
    "UPDATE tasks SET status = ?, output = ?, completed_at = ? WHERE id = ? AND status = 'assigned'"
  ).run(status, outputStr, now, id);
  if (info.changes !== 1) {
    metrics.inc('validate_failures');
    return res.status(500).json({ error: 'update did not apply' });
  }
  // Track worker failures for quarantine
  const workerId = req.body.worker_id || req.headers['x-worker-id'] || null;
  if (status === 'failed') {
    metrics.inc('tasks_failed');
    metrics.recordWorkerFailure(workerId);
    metrics.logEvent('fail', { task_id: id, worker_id: workerId });
    // Auto-retry: requeue once if task has not already been retried
    if (task.retries < 1) {
      db.prepare(
        "UPDATE tasks SET status = 'queued', assigned_at = NULL, output = NULL, completed_at = NULL, retries = retries + 1 WHERE id = ?"
      ).run(id);
      metrics.logEvent('retry', { task_id: id });
      return res.json({ status: 'ok', result: 'failed', retried: true });
    }
  } else {
    metrics.inc('tasks_completed');
    metrics.logEvent('complete', { task_id: id, worker_id: workerId });
  }
  res.json({ status: 'ok', result: status });
});

module.exports = { router, control };
