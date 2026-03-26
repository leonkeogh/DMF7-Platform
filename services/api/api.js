'use strict';

const express = require('express');
const os = require('os');
const daemon = require('../daemon/daemon');
const engineRouter = require('../engine/engine');

const app = express();
app.use(express.json());
app.use(engineRouter);

const startTime = Date.now();

app.get('/state', (req, res) => {
  res.json({
    status: 'ok',
    load: daemon.load,
    memory: daemon.memory,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.post('/control', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`DMF7 API running on port ${PORT}`);
});

module.exports = app;
