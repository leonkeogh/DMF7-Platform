'use strict';

const crypto  = require('crypto');
const express = require('express');
const db      = require('../data/db');

const router = express.Router();

const ADMIN_KEY = process.env.DMF7_ADMIN_KEY || null;

function adminAuth(req, res, next) {
  if (!ADMIN_KEY) return res.status(403).json({ error: 'admin not configured (DMF7_ADMIN_KEY unset)' });
  const provided = req.headers['x-admin-key'];
  if (!provided) return res.status(401).json({ error: 'missing x-admin-key' });
  // Constant-time compare
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(ADMIN_KEY);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error();
  } catch (_) {
    return res.status(401).json({ error: 'invalid x-admin-key' });
  }
  next();
}

// POST /admin/create-key
router.post('/create-key', adminAuth, (req, res) => {
  const { name, rate_limit } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const key = 'dmf7_' + crypto.randomBytes(24).toString('hex');
  const limit = (Number.isInteger(rate_limit) && rate_limit > 0) ? rate_limit : 60;
  db.prepare('INSERT INTO api_keys (key, name, created_at, rate_limit, active) VALUES (?, ?, ?, ?, 1)')
    .run(key, name.trim(), Date.now(), limit);
  res.json({ key, name: name.trim(), rate_limit: limit, active: 1 });
});

// GET /admin/keys
router.get('/keys', adminAuth, (req, res) => {
  const rows = db.prepare('SELECT key, name, created_at, rate_limit, active FROM api_keys ORDER BY created_at DESC').all();
  res.json({ keys: rows });
});

// PATCH /admin/keys/:key — toggle active, change rate_limit or name
router.patch('/keys/:key', adminAuth, (req, res) => {
  const { active, rate_limit, name } = req.body || {};
  const row = db.prepare('SELECT key FROM api_keys WHERE key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ error: 'key not found' });

  if (active !== undefined) {
    db.prepare('UPDATE api_keys SET active = ? WHERE key = ?').run(active ? 1 : 0, req.params.key);
  }
  if (Number.isInteger(rate_limit) && rate_limit > 0) {
    db.prepare('UPDATE api_keys SET rate_limit = ? WHERE key = ?').run(rate_limit, req.params.key);
  }
  if (name && typeof name === 'string' && name.trim()) {
    db.prepare('UPDATE api_keys SET name = ? WHERE key = ?').run(name.trim(), req.params.key);
  }

  const updated = db.prepare('SELECT key, name, created_at, rate_limit, active FROM api_keys WHERE key = ?').get(req.params.key);
  res.json(updated);
});

module.exports = router;
