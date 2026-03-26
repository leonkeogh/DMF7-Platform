'use strict';

const express = require('express');
const db = require('../data/db');

const router = express.Router();

const QUEUE_MAX = 1000;
const TASK_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

router.post('/engine/submit', (req, res) => {
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
  res.json({ status: 'ok', task_id: result.lastInsertRowid });
});

router.get('/engine/assign', (req, res) => {
  if (control.paused) {
    return res.status(503).json({ status: 'paused' });
  }
  const task = assignTask();
  if (!task) {
    return res.json({ status: 'empty' });
  }
  res.json({ status: 'ok', task });
});

router.post('/engine/validate', (req, res) => {
  const { task_id, output } = req.body || {};
  if (task_id === undefined || task_id === null || !/^\d+$/.test(String(task_id))) {
    return res.status(400).json({ error: 'task_id must be a positive integer' });
  }
  const id = parseInt(task_id, 10);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    return res.status(404).json({ error: 'task not found' });
  }
  const success = String(output) === task.expected_output;
  const status = success ? 'success' : 'failed';
  db.prepare(
    'UPDATE tasks SET status = ?, output = ?, completed_at = ? WHERE id = ?'
  ).run(status, output !== undefined ? String(output) : null, Date.now(), id);
  res.json({ status: 'ok', result: status });
});

module.exports = { router, control };
