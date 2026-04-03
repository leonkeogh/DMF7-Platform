'use strict';

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const daemon = require('../daemon/daemon');
const { router: engineRouter, control: engineControl } = require('../engine/engine');
const metrics = require('../metrics/metrics');
const rateLimiter = require('../middleware/rateLimiter');
const { getUsageSummary } = require('../billing/usage');
const db = require('../data/db');
require('../control/controlLoop');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../../public')));

const startTime = Date.now();
const API_KEY = process.env.DMF7_API_KEY || 'dev-key';
const DMF7_SECRET = process.env.DMF7_SECRET || null;
const CONTROL_COMMANDS = new Set(['pause', 'resume', 'reload', 'shutdown']);

function verifyValidateRequest(req, serviceName) {
  if (!DMF7_SECRET) return false;
  const ts = req.headers['x-dmf7-timestamp'];
  const sig = req.headers['x-dmf7-signature'];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() - parseInt(ts, 10)) > 10000) return false;
  const expected = crypto.createHmac('sha256', DMF7_SECRET)
    .update(ts + serviceName)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) {
    return false;
  }
}

function auth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

app.get('/metrics', (_req, res) => {
  res.json(metrics.getMetrics());
});

app.get('/state', (_req, res) => {
  res.json({
    status: 'ok',
    load: daemon.load,
    memory: daemon.memory,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/health', (_req, res) => {
  const m = metrics.getMetrics();
  const total = (m.tasks_completed + m.tasks_failed) || 1;
  const failureRate = parseFloat((m.tasks_failed / total).toFixed(4));
  res.json({
    status: 'ok',
    paused: engineControl.paused,
    failureRate,
  });
});

app.post('/validate', (req, res) => {
  if (!verifyValidateRequest(req, 'api')) {
    return res.status(403).json({ status: 'FAIL', reason: 'UNAUTHORIZED' });
  }

  const m = metrics.getMetrics();
  const paused = engineControl.paused;
  const status = paused ? 'DEGRADED' : 'VALID';

  res.json({
    status,
    service: 'api',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    load: daemon.load,
    paused,
    tasks_completed: m.tasks_completed,
    tasks_failed: m.tasks_failed,
  });
});

app.post('/subscribe', rateLimiter, (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const source = typeof req.body.source === 'string' ? req.body.source.trim() : 'site';

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'valid email required' });
  }

  try {
    db.prepare(
      'INSERT OR IGNORE INTO subscribers (email, source, created_at) VALUES (?, ?, ?)'
    ).run(email, source, Date.now());

    return res.json({ ok: true, email });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'subscribe failed' });
  }
});

app.get('/usage', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'missing x-api-key' });

  try {
    const row = db.prepare('SELECT monthly_limit FROM api_keys WHERE key = ?').get(apiKey);
    if (!row) return res.status(401).json({ error: 'invalid api key' });

    const { today, month } = getUsageSummary(apiKey);
    const remaining = Math.max(0, row.monthly_limit - month);

    res.json({
      usage_today: today,
      usage_month: month,
      monthly_limit: row.monthly_limit,
      remaining
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'usage fetch failed' });
  }
});

app.post('/control', auth, rateLimiter, (req, res) => {
  const { command } = req.body || {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'command required' });
  }
  if (!CONTROL_COMMANDS.has(command)) {
    return res.status(400).json({ error: `unknown command, valid: ${[...CONTROL_COMMANDS].join(', ')}` });
  }
  if (command === 'pause') {
    engineControl.paused = true;
    return res.json({ status: 'ok', command, engine: 'paused' });
  }
  if (command === 'resume') {
    engineControl.paused = false;
    return res.json({ status: 'ok', command, engine: 'running' });
  }
  if (command === 'reload') {
    daemon.updatedAt = 0;
    return res.json({ status: 'ok', command });
  }
  if (command === 'shutdown') {
    res.json({ status: 'ok', command });
    setImmediate(shutdown);
    return;
  }
});

app.use('/engine', auth, rateLimiter, engineRouter);

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`DMF7 API running on port ${PORT}`);
});

function shutdown() {
  server.close(() => {
    clearInterval(daemon._interval);
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
