# Migration Principles

> Safe schema changes with zero-downtime deployments.

## Safe Migration Patterns

### Adding a Column
```
1. Add column as NULLABLE (no default)
2. Deploy code that writes to new column
3. Backfill existing rows
4. Add NOT NULL constraint if needed
```

### Removing a Column
```
1. Stop reading from column in code
2. Stop writing to column in code
3. Deploy code changes
4. Drop column in migration
```

### Renaming a Column
```
1. Add new column
2. Write to both old and new
3. Backfill new column
4. Switch reads to new column
5. Stop writing to old column
6. Drop old column
```

### Adding an Index
```sql
-- Use CONCURRENTLY to avoid locking
CREATE INDEX CONCURRENTLY idx_name ON table (column);
```

## Core Principles

- Never make breaking changes in a single step
- Test migrations on a copy of production data
- Always have a rollback plan
- Use transactions when possible
- Keep migrations small and focused

## Serverless Databases

### Neon (PostgreSQL)
- Autoscaling compute
- Instant dev branches
- Full PostgreSQL compatibility
- Scale-to-zero for cost optimization

### Turso (SQLite)
- Edge locations for low latency
- SQLite compatibility
- Generous free tier
- Global distribution
