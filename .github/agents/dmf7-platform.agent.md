# DMF7-Platform Agent Manifest
name: dmf7-platform-agent
description: Guided Copilot Agent for DMF7-Platform monorepo. MUST follow these rules:
- Always run repository tests and authority validation before proposing changes.
- Do NOT create or commit any secrets, credentials, or private keys.
- Any change touching `services/crypto_layer/` or `services/authority/` requires human review and explicit approval.
- All PRs created by agent must reference authority validation output and CI artifacts.

task:
  - id: validate-and-propose
    run: |
      # 1) Run authority validation (must succeed)
      if [ -f services/authority/phase_gate.py ]; then
        python3 services/authority/phase_gate.py --validate || { echo "authority validation failed"; exit 1; }
      fi
      # 2) Run unit tests if present
      if [ -d services ]; then
        echo "Running basic sanity checks..."
        # Agents should run per-service tests; placeholder below for agent to expand
        # Example: cd services/dmf7 && ./ci/build-and-test.sh
      fi
    outputs:
      - name: validation_status
        description: "Pass/fail result of authority + CI checks"
