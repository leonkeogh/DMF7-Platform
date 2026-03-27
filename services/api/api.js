'use strict';

const crypto = require('crypto');
const express = require('express');
const daemon = require('../daemon/daemon');
const { router: engineRouter, control: engineControl } = require('../engine/engine');
const metrics = require('../metrics/metrics');
const rateLimiter = require('../middleware/rateLimiter');
const apiKeyAuth = require('../middleware/apiKeyAuth');
const adminRouter = require('../admin/admin');
require('../control/controlLoop'); // side-effect: starts autonomous control loop

const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

const startTime = Date.now();

const API_KEY = process.env.DMF7_API_KEY || 'dev-key';
const DMF7_SECRET = process.env.DMF7_SECRET || null;
const CONTROL_COMMANDS = new Set(['pause', 'resume', 'reload', 'shutdown']);

// HMAC-SHA256 request verification for /validate
// Rejects if DMF7_SECRET is unset, timestamp is outside ±10s, or signature wrong.
function verifyValidateRequest(req, serviceName) {
  if (!DMF7_SECRET) return false; // no secret configured — deny all
  const ts = req.headers['x-dmf7-timestamp'];
  const sig = req.headers['x-dmf7-signature'];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() - parseInt(ts, 10)) > 10000) return false;
  const expected = crypto.createHmac('sha256', DMF7_SECRET)
    .update(ts + serviceName)
    .digest('hex');
  // Constant-time comparison prevents timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) {
    return false; // malformed hex in sig header
  }
}

// Two-tier auth model (intentional):
//   /validate        → HMAC-SHA256 (X-DMF7-SIGNATURE) — orchestrator identity
//   /engine/* /control → x-api-key — internal service calls (worker, operators)
// Worker sends both headers; only /validate verifies the HMAC.
function auth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Public — no auth required
app.get('/metrics', (req, res) => {
  res.json(metrics.getMetrics());
});

app.get('/state', (req, res) => {
  res.json({
    status: 'ok',
    load: daemon.load,
    memory: daemon.memory,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.get('/health', (req, res) => {
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

// Admin routes — require x-admin-key
app.use('/admin', adminRouter);

// Protected — auth required
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

// Protected — all /engine/* routes require valid API key (per-key rate limit inside apiKeyAuth)
app.use('/engine', apiKeyAuth, engineRouter);

app.use((err, req, res, next) => {
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
