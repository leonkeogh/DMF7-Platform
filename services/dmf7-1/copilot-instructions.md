# GitHub Copilot Instructions — DMF7

This repository prioritizes determinism, auditability, and governance-first design.

Rules for all contributions:
- Prefer explicit, deterministic logic over abstraction.
- Avoid non-deterministic behavior (time, randomness, unordered maps) unless explicitly documented.
- Treat docs in /docs/specs as canonical unless marked STATUS: UNKNOWN.
- Do not modify governance, CI, or security-related files without explicit instruction.
- Favor small, reviewable commits aligned to a single concern.

Coding standards:
- Node.js / TypeScript preferred.
- No hidden side effects.
- Clear inputs and outputs.
- Fail closed by default.

Review posture:
- Optimize for clarity, traceability, and long-term maintainability over speed.
