'use strict';

const db = require('../data/db');

// In-memory rate limit buckets: { [key]: { windowStart, count } }
const buckets = {};

function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'missing x-api-key' });

  const row = db.prepare('SELECT rate_limit, active FROM api_keys WHERE key = ?').get(key);
  if (!row || !row.active) return res.status(401).json({ error: 'invalid or inactive api key' });

  // Per-key rate limiting (per minute)
  const now = Date.now();
  const WINDOW = 60000;
  const limit  = row.rate_limit;

  if (!buckets[key] || now - buckets[key].windowStart >= WINDOW) {
    buckets[key] = { windowStart: now, count: 1 };
  } else {
    buckets[key].count++;
    if (buckets[key].count > limit) {
      return res.status(429).json({ error: 'rate limit exceeded', limit, window: '1m' });
    }
  }

  req.apiKey = key;
  next();
}

module.exports = apiKeyAuth;
