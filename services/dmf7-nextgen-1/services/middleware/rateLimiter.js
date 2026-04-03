'use strict';

const WINDOW_MS = 1000;
const MAX_REQUESTS = 20;

// Buckets keyed by API key (or IP fallback) — memory grows with unique callers
// Accepted for current controlled deployment; add LRU eviction before public exposure
const buckets = {};

function rateLimiter(req, res, next) {
  const key = req.headers['x-api-key'] || req.ip;
  const now = Date.now();

  if (!buckets[key] || now - buckets[key].windowStart >= WINDOW_MS) {
    buckets[key] = { windowStart: now, count: 1 };
    return next();
  }

  buckets[key].count++;

  if (buckets[key].count > MAX_REQUESTS) {
    return res.status(429).json({ error: 'rate limit exceeded' });
  }

  next();
}

module.exports = rateLimiter;
