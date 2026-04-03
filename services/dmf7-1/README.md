# DMF7

DMF7 monorepo for Daana Money Factory. GitHub-first 7-site platform with Cloudflare edge security, CI/CD, and operator-proof deployment.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all services
pnpm build

# Run in development mode
pnpm dev

# Check formatting
pnpm format:check
```

## Structure

```
dmf7/
├── docs/specs/       # Architecture specifications
├── migrations/       # Database migrations
├── services/         # Backend microservices
│   ├── gateway/
│   ├── operator-console/
│   ├── ingest/
│   └── retrieval/
└── .github/workflows/  # CI/CD configuration
```

## Requirements

- Node.js >= 20.0.0
- pnpm 9.x

## Documentation

- [Specification Index](./docs/specs/00_index.md)
- [Architecture](./docs/specs/01_architecture.md)
- [API Contracts](./docs/specs/02_api_contracts.md)
- [Data Model](./docs/specs/03_data_model.md)
- [Security](./docs/specs/04_security_and_access.md)
- [CI/CD](./docs/specs/05_ci_cd.md)

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.
