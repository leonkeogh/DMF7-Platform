# API Contracts Specification

## Overview

This document defines the API contracts for DMF7 services.

## Common Headers

| Header | Description | Required |
|--------|-------------|----------|
| `Authorization` | Bearer token with tenant claims | UNKNOWN |
| `X-Request-ID` | Unique request identifier | Recommended |
| `Content-Type` | `application/json` | Yes |

## Gateway Service

### Health Check

```
GET /health
```

**Response:**
```json
{
  "ok": true,
  "service": "gateway",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Task Submit (Placeholder)

```
POST /api/v1/tasks
```

**Status**: UNKNOWN - Not yet implemented

### Task Status (Placeholder)

```
GET /api/v1/tasks/:id
```

**Status**: UNKNOWN - Not yet implemented

## Ingest Service

### Trigger Ingestion (Placeholder)

```
POST /api/v1/ingest
```

**Status**: UNKNOWN - Not yet implemented

## Authentication Scheme

**Status**: UNKNOWN

Placeholder: Bearer token with tenant claims. Implementation details pending.

```
Authorization: Bearer <jwt>
```

JWT Claims (placeholder):
```json
{
  "sub": "user_id",
  "tenant": "tenant_id",
  "scopes": ["read", "write"]
}
```

## Error Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```
