# Copilot / Agent Instructions (DMF7 Platform)
# (Customizable) - contains high-level repo guidance for Copilot agents.
# Key points:
# - This repository is a monorepo for DMF7 Platform. Top-level directories:
#    - services/<plane-name>  -> microservices by plane
#    - libs/                  -> shared libraries
#    - infra/                 -> terraform/k8s/argocd
#    - .github/               -> workflows & agent instructions
# - Agents must run tests and pass `validate_phase` (authority checks) before proposing deployments.
# - Agents must not write secrets or keys - they should create PRs with telemetry hooks only.
# - Refer to AGENTS.md for agent goals and constraints.
