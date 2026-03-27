'use strict';

const http = require('http');
const crypto = require('crypto');

const WORKER_ID = process.env.WORKER_ID || 'node-local';
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 5000;
const API_KEY = process.env.DMF7_API_KEY || 'dev-key';
const DMF7_SECRET = process.env.DMF7_SECRET || null;
const POLL_INTERVAL_MS = 1000;
const EXEC_TIMEOUT_MS = 5000;

let running = false; // prevents concurrent loop ticks
let shuttingDown = false;

// Sign outbound requests when DMF7_SECRET is present (no-op in dev mode).
function signHeaders() {
  if (!DMF7_SECRET) return {};
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', DMF7_SECRET)
    .update(ts + 'worker')
    .digest('hex');
  return { 'X-DMF7-TIMESTAMP': ts, 'X-DMF7-SIGNATURE': sig };
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...signHeaders(),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          reject(new Error(`non-JSON response: ${data}`));
        }
      });
    });
    req.setTimeout(EXEC_TIMEOUT_MS, () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function execute(task) {
  // Execution stub: real logic replaces this per deployment
  // Returns the computed output string for the given task payload
  return String(task.payload);
}

async function tick() {
  if (running || shuttingDown) return;
  running = true;

  try {
    // 1. Assign — only one task claimed per tick
    const assign = await request('GET', '/engine/assign');

    if (assign.status === 503) {
      // Engine paused — back off, do not retry immediately
      return;
    }
    if (assign.status !== 200) {
      console.error('assign error:', assign.status, assign.body);
      return;
    }
    if (assign.body.status === 'empty') {
      // No work available — normal idle state
      return;
    }

    const task = assign.body.task;
    if (!task || typeof task.id === 'undefined') {
      console.error('assign returned malformed task:', assign.body);
      return;
    }

    console.log('assigned', WORKER_ID, task.id);

    // 2. Execute — bounded, synchronous stub
    let output;
    try {
      output = execute(task);
    } catch (err) {
      console.error(`execution error task ${task.id}:`, err.message);
      // Submit a failure result so the task exits the assigned state
      output = '__execution_error__';
    }

    // 3. Validate — exactly once per assign, one retry on transient failure
    let validate;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        validate = await request('POST', '/engine/validate', { task_id: task.id, output, worker_id: WORKER_ID });
        break;
      } catch (err) {
        if (attempt === 2) throw err; // re-throw on second failure — caught by outer try
        console.log('retry', WORKER_ID, task.id);
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (validate.status === 409) {
      // Task already validated by another worker — not an error in a multi-worker setup
      console.warn(`task ${task.id} already validated (409) — skipping`);
      return;
    }
    if (validate.status !== 200) {
      console.error(`validate error task ${task.id}:`, validate.status, validate.body);
      return;
    }

    const result = validate.body && validate.body.result ? validate.body.result : 'unknown';
    console.log('validated', WORKER_ID, task.id, result);
  } catch (err) {
    console.error('tick error:', err.message);
  } finally {
    running = false;
  }
}

const timer = setInterval(tick, POLL_INTERVAL_MS);

function shutdown() {
  shuttingDown = true;
  clearInterval(timer);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
  console.error('unhandled rejection:', reason);
  // Do not exit — log and allow next tick to proceed
});

console.log(`DMF7 worker polling ${API_HOST}:${API_PORT} every ${POLL_INTERVAL_MS}ms`);
