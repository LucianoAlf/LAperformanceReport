# Query Optimization

> Measure first, optimize second.

## The N+1 Problem

```
BAD: N+1 queries
├── 1 query: SELECT * FROM users
└── N queries: SELECT * FROM orders WHERE user_id = ?

GOOD: Single query
└── SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id

GOOD: Eager loading (ORM)
└── User.findAll({ include: [Order] })

GOOD: DataLoader pattern
└── Batch: SELECT * FROM orders WHERE user_id IN (1, 2, 3, ...)
```

## Before Optimizing

Always run EXPLAIN ANALYZE first:

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'active';
```

Look for:
- Seq Scan (full table scan) → needs index
- High actual rows vs estimated → stale statistics
- Nested Loop with large datasets → consider hash/merge join

## Optimization Priority

1. **Add missing indexes** (most common fix)
2. **Select specific columns** (avoid SELECT *)
3. **Use JOINs** instead of subqueries when possible
4. **Add LIMIT** for pagination
5. **Cache** frequently accessed, rarely changing data

## Common Patterns

```sql
-- Pagination with cursor (better than OFFSET)
SELECT * FROM orders
WHERE id > :last_id
ORDER BY id
LIMIT 20;

-- Avoid counting all rows
SELECT EXISTS(SELECT 1 FROM orders WHERE status = 'active');
-- Instead of
SELECT COUNT(*) FROM orders WHERE status = 'active';
```
