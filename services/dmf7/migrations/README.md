# Database Migrations

## Overview

This directory contains SQL migrations for the DMF7 database schema.

## Numbering Scheme

Migrations are numbered sequentially:
- `0001_init.sql`
- `0002_add_users.sql`
- `0003_add_audit_log.sql`
- etc.

## Rules

1. **Append-only**: Never edit an applied migration file
2. **Create new files**: To modify schema, create a new numbered migration
3. **Idempotent patterns**: Use `IF NOT EXISTS` where possible
4. **No destructive drops**: Avoid `DROP TABLE` without careful consideration

## Applying Migrations

### Using psql (placeholder)

```bash
psql $DATABASE_URL -f migrations/0001_init.sql
```

### Using ORM (placeholder)

Migration tooling TBD based on chosen ORM/query builder.

## Migration Status

| File | Description | Status |
|------|-------------|--------|
| 0001_init.sql | Initial schema placeholders | Placeholder |

## Best Practices

1. Test migrations on a copy of production data
2. Always have a rollback plan
3. Keep migrations small and focused
4. Document breaking changes
