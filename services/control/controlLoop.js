'use strict';

const metrics = require('../metrics/metrics');
const { control } = require('../engine/engine');

const INTERVAL_MS = 2000;
const FAILURE_RATE_PAUSE_THRESHOLD = 0.3;  // pause when ≥30% of completions are failures
const FAILURE_RATE_RESUME_THRESHOLD = 0.1; // resume when failure rate drops below 10%
const FAILURE_RATE_EMERGENCY = 0.5;        // emergency pause — bypasses guard timer
const ACTION_GUARD_MS = 5000;              // minimum ms between state transitions

let lastAction = 0;

function tick() {
  try {
    const m = metrics.getMetrics();
    const total = (m.tasks_completed + m.tasks_failed) || 1; // guard division by zero
    const failureRate = m.tasks_failed / total;
    const now = Date.now();
    const paused = control.paused;

    // Emergency cascade: >50% failure rate bypasses the 5s guard timer
    if (!paused && failureRate >= FAILURE_RATE_EMERGENCY) {
      control.paused = true;
      lastAction = now;
      console.log(`[control-loop] EMERGENCY_PAUSE — failure rate ${(failureRate * 100).toFixed(1)}%`);
      return;
    }

    if (!paused && failureRate >= FAILURE_RATE_PAUSE_THRESHOLD && now - lastAction > ACTION_GUARD_MS) {
      control.paused = true;
      lastAction = now;
      console.log(`[control-loop] AUTO_PAUSE — failure rate ${(failureRate * 100).toFixed(1)}%`);
      return;
    }

    if (paused && failureRate < FAILURE_RATE_RESUME_THRESHOLD && now - lastAction > ACTION_GUARD_MS) {
      control.paused = false;
      lastAction = now;
      console.log(`[control-loop] AUTO_RESUME — failure rate ${(failureRate * 100).toFixed(1)}%`);
    }
  } catch (err) {
    console.error('[control-loop] tick error:', err.message);
  }
}

const timer = setInterval(tick, INTERVAL_MS);
timer.unref(); // do not block process shutdown

console.log('[control-loop] started — interval 2s, pause@30% fail, resume@10% fail');
