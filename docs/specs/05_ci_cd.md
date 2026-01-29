# CI/CD Specification

## Required Workflow

### CI / Validate

Triggers on:
- Push to `main`
- All pull requests

### Steps Order

1. **Checkout**: `actions/checkout@v4`
2. **Setup Node**: `actions/setup-node@v4` with Node 20
3. **Enable Corepack**: `corepack enable`
4. **Install pnpm**: Via corepack
5. **Install dependencies**: `pnpm install --frozen-lockfile`
6. **Format check**: `pnpm format:check`
7. **Lint**: `pnpm lint` (when implemented)
8. **Build**: `pnpm build`
9. **Test**: `pnpm test` (when implemented)

### Workflow File

Location: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm build
```

## Deployment Pipeline

**Status**: UNKNOWN

Placeholder for future deployment configuration:
- Staging deployment on PR merge
- Production deployment on release tag

## Required Checks

Before merging to main:
- CI / validate must pass
- At least 1 approval (when branch protection enabled)

## Cache Strategy

- pnpm store cached via `actions/cache` (optional enhancement)
- Turbo remote caching: UNKNOWN - not yet configured
