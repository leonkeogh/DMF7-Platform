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

function inc(key) {
  if (!(key in state)) return;
  state[key]++;
  state.last_updated = Date.now();
}

function getMetrics() {
  // Shallow copy — prevents external mutation of internal counters
  return { ...state };
}

module.exports = { inc, getMetrics };
