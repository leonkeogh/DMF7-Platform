'use strict';

const express = require('express');

const router = express.Router();
const queue = [];
let taskIdCounter = 1;

router.post('/engine/submit', (req, res) => {
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
  task.status = 'assigned';
  task.assignedAt = Date.now();
  res.json({ status: 'ok', task });
});

router.post('/engine/validate', (req, res) => {
  const { task_id, output } = req.body || {};
  const task = queue.find((t) => t.id === task_id);
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
