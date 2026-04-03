# Architecture Specification

## Monorepo Layout

DMF7 uses a pnpm workspace monorepo with Turborepo for task orchestration.

### Directory Structure

```
dmf7/
├── apps/           # Full applications (UNKNOWN - not yet populated)
├── packages/       # Shared libraries (UNKNOWN - not yet populated)
├── sites/          # Site-specific code (UNKNOWN - not yet populated)
├── services/       # Backend microservices
├── docs/           # Documentation
└── migrations/     # Database migrations
```

### Workspace Configuration

- **Package manager**: pnpm 9.x
- **Node version**: >= 20.0.0
- **Task runner**: Turborepo 2.x

## Service Boundaries

| Service | Purpose | Port |
|---------|---------|------|
| gateway | API gateway and routing | UNKNOWN |
| operator-console | Admin dashboard backend | UNKNOWN |
| ingest | Data ingestion pipeline | UNKNOWN |
| retrieval | Query and retrieval service | UNKNOWN |

## Deployment Targets

- **Primary**: UNKNOWN (Cloudflare/Vercel to be determined)
- **Edge security**: Cloudflare (per README)
- **Database**: UNKNOWN

## Build Pipeline

```bash
# Install dependencies
pnpm install

# Build all services
pnpm build

# Run in development
pnpm dev
```

## Dependencies

All services share common TypeScript configuration. Each service is independently deployable.
