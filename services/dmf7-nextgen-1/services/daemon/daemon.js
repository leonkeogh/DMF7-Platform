'use strict';

const os = require('os');

const state = {
  load: 0,
  memory: 0,
  updatedAt: Date.now(),
};

function cpuSnapshot() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const t of Object.keys(cpu.times)) total += cpu.times[t];
    idle += cpu.times.idle;
  }
  return { idle, total };
}

let prev = cpuSnapshot();

function collect() {
  const curr = cpuSnapshot();
  const idleDelta = curr.idle - prev.idle;
  const totalDelta = curr.total - prev.total;
  state.load = totalDelta === 0 ? 0 : parseFloat(((1 - idleDelta / totalDelta) * 100).toFixed(2));
  state.memory = parseFloat(((1 - os.freemem() / os.totalmem()) * 100).toFixed(2));
  state.updatedAt = Date.now();
  prev = curr;
}

collect();
state._interval = setInterval(collect, 1000);

module.exports = state;
