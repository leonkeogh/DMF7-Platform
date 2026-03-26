# DMF7-NextGen

Next-generation DMF7 monorepo with distributed plane architecture.

**Status: Bootstrap Phase**

---

## System Purpose

DMF7-NextGen is a modular multi-plane runtime for distributed monitoring, task execution, authorization, trust management, and federation. The core runtime exposes HTTP services that can be composed into larger control-plane topologies.

---

## Architecture

```
services/
  api/      → HTTP gateway (port 5000) — state, control, engine routes
  daemon/   → Background collector — CPU load, memory usage (1s interval)
  engine/   → Task queue — submit, assign, validate lifecycle

planes/
  authority/       → Access control and authorization
  copilot_rules/   → Rule enforcement and policy management
  crypto_layer/    → Cryptography and security
  execution/       → Task orchestration
  federation/      → Inter-system communication
  observation/     → System monitoring and telemetry
  trust_lattice/   → Trust computation
```

---

## Endpoints

### State

```
GET /state
```
Returns current system metrics.

```json
{
  "status": "ok",
  "load": 12.4,
  "memory": 61.3,
  "uptime": 42
}
```

### Control

```
POST /control
```
Accepts control signals. Returns `{ "status": "ok" }`.

### Engine

```
POST /engine/submit     → enqueue a task
GET  /engine/assign     → claim next queued task
POST /engine/validate   → submit output and validate against expected
```

---

## Quickstart

```bash
npm install
node services/api/api.js
curl http://localhost:5000/state
```

---

## CI

GitHub Actions pipeline installs dependencies, verifies node version, and runs a live smoke test against the API on every push.
