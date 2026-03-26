'use strict';

const express = require('express');
const daemon = require('../daemon/daemon');
const { router: engineRouter, control: engineControl } = require('../engine/engine');

const app = express();
app.use(express.json());
app.use(engineRouter);

const startTime = Date.now();

const CONTROL_COMMANDS = new Set(['pause', 'resume', 'reload', 'shutdown']);

app.get('/state', (req, res) => {
  res.json({
    status: 'ok',
    load: daemon.load,
    memory: daemon.memory,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.post('/control', (req, res) => {
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
    // Re-trigger daemon collection to refresh metrics immediately
    daemon.updatedAt = 0;
    return res.json({ status: 'ok', command });
  }
  if (command === 'shutdown') {
    res.json({ status: 'ok', command });
    setImmediate(shutdown);
    return;
  }
});

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
