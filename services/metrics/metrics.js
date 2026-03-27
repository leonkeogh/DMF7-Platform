'use strict';

const state = {
  tasks_submitted: 0,
  tasks_assigned: 0,
  tasks_completed: 0,
  tasks_failed: 0,
  assign_failures: 0,
  validate_failures: 0,
  last_updated: Date.now(),
};

// Worker failure tracking for quarantine decisions
const workerFailures = {}; // { workerId: [timestamp, ...] }
const QUARANTINE_WINDOW_MS = 30000; // 30s sliding window
const QUARANTINE_THRESHOLD = 3;     // failures to trigger quarantine
const QUARANTINE_DURATION_MS = 60000; // 60s quarantine
const quarantined = {}; // { workerId: expiresAt }

function inc(key) {
  if (!(key in state)) return;
  state[key]++;
  state.last_updated = Date.now();
}

function recordWorkerFailure(workerId) {
  if (!workerId) return;
  const now = Date.now();
  if (!workerFailures[workerId]) workerFailures[workerId] = [];
  workerFailures[workerId].push(now);
  // Trim to window
  workerFailures[workerId] = workerFailures[workerId].filter(t => now - t < QUARANTINE_WINDOW_MS);
  if (workerFailures[workerId].length >= QUARANTINE_THRESHOLD) {
    quarantined[workerId] = now + QUARANTINE_DURATION_MS;
    console.log(`[quarantine] worker ${workerId} quarantined for ${QUARANTINE_DURATION_MS / 1000}s`);
  }
}

function isQuarantined(workerId) {
  if (!workerId || !quarantined[workerId]) return false;
  if (Date.now() >= quarantined[workerId]) {
    delete quarantined[workerId];
    delete workerFailures[workerId];
    return false;
  }
  return true;
}

function getMetrics() {
  // Shallow copy — prevents external mutation of internal counters
  return { ...state };
}

function getFailureRate() {
  const total = (state.tasks_completed + state.tasks_failed) || 1;
  return state.tasks_failed / total;
}

module.exports = { inc, getMetrics, getFailureRate, recordWorkerFailure, isQuarantined };
