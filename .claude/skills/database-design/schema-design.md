# Schema Design Principles

> Good schema design prevents most performance and maintenance problems.

## Normalization Decision

```
Normalize when:
├── Data is repeated across rows
├── Updates would need multiple changes
├── Data has its own lifecycle
└── Referential integrity matters

Denormalize when:
├── Read performance is critical
├── Data rarely changes
├── Joins are too expensive
└── Reporting/analytics queries
```

## Primary Key Selection

| Type | When to Use |
|------|------------|
| **UUID** | Distributed systems, no sequential exposure |
| **ULID** | Sortable + distributed |
| **Auto-increment** | Simple apps, single database |
| **Natural key** | Rare - only when business meaning is stable |

## Timestamps

Every table should have:

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
deleted_at TIMESTAMPTZ  -- soft delete (optional)
```

Use `TIMESTAMPTZ`, not `TIMESTAMP` (always store timezone info).

## Relationships

### One-to-One
```sql
-- Separate table with FK
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  bio TEXT,
  avatar_url TEXT
);
```

### One-to-Many
```sql
-- FK on the "many" side
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  total DECIMAL(10,2)
);
```

### Many-to-Many
```sql
-- Junction table
CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id),
  role_id UUID REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);
```

## Foreign Key Actions

| Action | Behavior |
|--------|----------|
| **CASCADE** | Delete children with parent |
| **SET NULL** | Orphan children (nullable FK) |
| **RESTRICT** | Prevent parent deletion |
| **SET DEFAULT** | Set FK to default value |
