'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'engine.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id         INTEGER PRIMARY KEY,
    payload    TEXT    NOT NULL,
    expected_output TEXT,
    status     TEXT    NOT NULL DEFAULT 'queued',
    output     TEXT,
    created_at  INTEGER NOT NULL,
    assigned_at INTEGER,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS control_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Recovery: any task left in 'assigned' on startup was interrupted — requeue it
db.prepare("UPDATE tasks SET status = 'queued', assigned_at = NULL WHERE status = 'assigned'").run();

// Seed default control state if not present
db.prepare("INSERT OR IGNORE INTO control_state (key, value) VALUES ('paused', 'false')").run();

module.exports = db;
