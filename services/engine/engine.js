'use strict';

const express = require('express');

const router = express.Router();
const queue = [];
let taskIdCounter = 1;

const QUEUE_MAX = 1000;
const TASK_TTL_MS = 5 * 60 * 1000; // 5 minutes

function evict() {
  const cutoff = Date.now() - TASK_TTL_MS;
  for (let i = queue.length - 1; i >= 0; i--) {
    const t = queue[i];
    if ((t.status === 'success' || t.status === 'failed') && t.completedAt < cutoff) {
      queue.splice(i, 1);
    }
  }
}

router.post('/engine/submit', (req, res) => {
  evict();
  if (queue.length >= QUEUE_MAX) {
    return res.status(429).json({ error: 'queue full' });
  }
  const { payload, expected_output } = req.body || {};
  if (payload === undefined) {
    return res.status(400).json({ error: 'payload required' });
  }
  const task = {
    id: taskIdCounter++,
    payload,
    expected_output,
    status: 'queued',
    createdAt: Date.now(),
  };
  queue.push(task);
  res.json({ status: 'ok', task_id: task.id });
});

router.get('/engine/assign', (req, res) => {
  const task = queue.find((t) => t.status === 'queued');
  if (!task) {
    return res.json({ status: 'empty' });
  }
  // Mark assigned before responding to prevent duplicate assignment under concurrency
  task.status = 'assigned';
  task.assignedAt = Date.now();
  res.json({ status: 'ok', task });
});

router.post('/engine/validate', (req, res) => {
  const { task_id, output } = req.body || {};
  // Coerce to integer — request bodies may send task_id as string
  const id = parseInt(task_id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'task_id must be a number' });
  }
  const task = queue.find((t) => t.id === id);
  if (!task) {
    return res.status(404).json({ error: 'task not found' });
  }
  const success = output === task.expected_output;
  task.status = success ? 'success' : 'failed';
  task.completedAt = Date.now();
  task.output = output;
  res.json({ status: 'ok', result: task.status });
});

module.exports = router;
