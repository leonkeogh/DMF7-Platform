# Data Model Specification

## Overview

This document defines the database schema and migration strategy for DMF7.

## Tables (Placeholder)

### tenants

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(255) | Tenant name |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

**Status**: Placeholder - not yet implemented

### users

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID | Foreign key to tenants |
| email | VARCHAR(255) | User email |
| created_at | TIMESTAMPTZ | Creation timestamp |

**Status**: Placeholder - not yet implemented

### audit_log

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| actor_id | UUID | User who performed action |
| action | VARCHAR(100) | Action type |
| resource | VARCHAR(255) | Affected resource |
| metadata | JSONB | Additional context |
| created_at | TIMESTAMPTZ | Event timestamp |

**Status**: Placeholder - not yet implemented

### chunks

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| content | TEXT | Chunk content |
| metadata | JSONB | Chunk metadata |
| created_at | TIMESTAMPTZ | Creation timestamp |

**Status**: Placeholder - not yet implemented

### embeddings

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| chunk_id | UUID | Foreign key to chunks |
| vector | VECTOR(1536) | Embedding vector (pgvector) |
| model | VARCHAR(100) | Model used for embedding |

**Status**: Placeholder - not yet implemented

## Migration Strategy

- **Numbering**: `0001_`, `0002_`, etc.
- **Location**: `/migrations/`
- **Rule**: Append-only. Never edit applied migration files.
- **Pattern**: Use `IF NOT EXISTS` for idempotency

See [migrations/README.md](/migrations/README.md) for details.
