'use strict';

const db = require('../data/db');

const HOUR = 60 * 60 * 1000;
const DAY  = 24 * HOUR;
const MONTH = 30 * DAY;

function getUsageSummary(apiKey) {
  const now = Date.now();

  const today = db.prepare(
    'SELECT COUNT(*) as c FROM api_usage WHERE api_key = ? AND created_at > ?'
  ).get(apiKey, now - DAY).c;

  const month = db.prepare(
    'SELECT COUNT(*) as c FROM api_usage WHERE api_key = ? AND created_at > ?'
  ).get(apiKey, now - MONTH).c;

  return { today, month };
}

module.exports = { getUsageSummary };
