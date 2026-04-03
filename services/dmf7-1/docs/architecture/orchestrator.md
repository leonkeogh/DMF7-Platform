# Orchestrator Architecture (Phase 2)

## Purpose
Introduce a central orchestrator to unify all module interactions and control execution flow.

---

## Execution Flow
user → gateway → orchestrator → module → datastore → response

---

## API Contract
All modules must follow:

{
  "input": {},
  "output": {},
  "status": "ok | error",
  "metadata": {}
}

---

## Responsibilities of Orchestrator
- Route requests to appropriate modules
- Enforce API schema
- Log all requests and responses
- Handle errors and retries

---

## Logging Rules

- Log audit metadata for every request entering the orchestrator. At minimum include: request_id, actor, target module, status, and duration.

- For module responses, log only metadata and explicitly allowlisted fields. Do NOT log full raw payloads. Never log secrets, tokens, credentials, or sensitive user data.

- Apply redaction to any sensitive fields before logging.

- Log errors using sanitized context only. Include:
  request_id, actor, module name, error code, and a high-level message.

- Do NOT include raw request or response bodies in logs.

- All logging behavior must comply with:
  docs/specs/04_security_and_access.md

---

## Error Handling
- Return structured error responses
- Do not crash on module failure
- Allow retry logic where applicable

---

## Rules
- No direct module-to-module calls
- All communication goes through orchestrator
- Orchestrator remains lightweight (no business logic)