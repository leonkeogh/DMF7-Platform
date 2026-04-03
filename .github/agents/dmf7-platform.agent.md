# DMF7-Platform Agent Manifest
name: dmf7-platform-agent
description: Guided Copilot Agent for DMF7-Platform monorepo.
rules:
  - never_commit_secrets: true
  - require_human_approval_for_crypto: true
task:
  - id: validate-and-propose
    run: |
      if [ -f services/authority/phase_gate.py ]; then
        python3 services/authority/phase_gate.py --validate || { echo "authority validation failed"; exit 1; }
      fi
      # Placeholder: agent should run per-service tests here
      echo "Validation OK (placeholder)"
    outputs:
      - name: validation_status
        description: "Pass/fail result of authority + CI checks"
