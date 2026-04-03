# Services

Backend microservices for DMF7.

## Service Overview

| Service | Description |
|---------|-------------|
| **gateway** | API gateway handling routing and request orchestration |
| **operator-console** | Admin dashboard backend for system operators |
| **ingest** | Data ingestion pipeline for processing incoming content |
| **retrieval** | Query and retrieval service for searching indexed content |

## Development

Each service is independently buildable:

```bash
# Build all services
pnpm build

# Build specific service
pnpm --filter @dmf7/gateway build

# Run in development
pnpm dev
```

## Adding a New Service

1. Create directory: `services/<name>/`
2. Add `package.json` with name `@dmf7/<name>`
3. Add `src/index.ts` with health export
4. Add `tsconfig.json` extending root config
