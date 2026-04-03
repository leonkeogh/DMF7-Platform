# Agent / Copilot Agent Handbook (DMF7 Platform)
# Summary: guidelines for autonomous agents working in this repo.
# - Agent goals: scaffold components, create PRs with test coverage, and wire CI.
# - Refusal conditions:
#   - Do not write keys or push service account files.
#   - If a proposed change affects crypto_layer or authority, require human review.
# - CI expectations:
#   - Tests must be added for each new service.
#   - Authority checks must pass: services/authority/phase_gate.py --validate
