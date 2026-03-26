'use strict';

const os = require('os');

const state = {
  load: 0,
  memory: 0,
  updatedAt: Date.now(),
};

function collect() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  state.load = parseFloat(((1 - idle / total) * 100).toFixed(2));
  state.memory = parseFloat(((1 - os.freemem() / os.totalmem()) * 100).toFixed(2));
  state.updatedAt = Date.now();
}

collect();
setInterval(collect, 1000);

module.exports = state;
