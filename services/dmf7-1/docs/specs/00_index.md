# DMF7 Specification Index

## Scope

DMF7 monorepo baseline for Daana Money Factory. GitHub-first 7-site platform with Cloudflare edge security, CI/CD, and operator-proof deployment.

## Canonical Commands

```bash
pnpm install        # Install all dependencies
pnpm dev            # Start development servers
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm format:check   # Check code formatting
```

## Folder Map

```
dmf7/
├── apps/           # Application packages
├── packages/       # Shared libraries
├── sites/          # Site-specific code
├── services/       # Backend services
│   ├── gateway/
│   ├── operator-console/
│   ├── ingest/
│   └── retrieval/
├── docs/
│   └── specs/      # This directory
└── migrations/     # Database migrations
```

## Authority Model

- **Spec documents**: Source of truth for architecture decisions
- **UNKNOWN discipline**: Anything not verified from repo is marked `UNKNOWN`
- **Append-only migrations**: Never edit applied migration files

## Specification Documents

| File | Description |
|------|-------------|
| [01_architecture.md](./01_architecture.md) | Monorepo layout and service boundaries |
| [02_api_contracts.md](./02_api_contracts.md) | API endpoints and contracts |
| [03_data_model.md](./03_data_model.md) | Database schema and migrations |
| [04_security_and_access.md](./04_security_and_access.md) | Security policies and access control |
| [05_ci_cd.md](./05_ci_cd.md) | CI/CD pipeline configuration |
