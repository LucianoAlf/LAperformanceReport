# Database Selection (2025)

> Choose database based on REQUIREMENTS, not defaults.

## Decision Tree

```
What are your requirements?
│
├── Need relational features?
│   ├── Self-hosted → PostgreSQL
│   └── Serverless → Neon or Supabase
│
├── Edge deployment?
│   └── Turso (edge-optimized SQLite)
│
├── Need AI/vector search?
│   └── PostgreSQL + pgvector
│
├── Simple/embedded?
│   └── SQLite
│
└── Distributed/global?
    └── PlanetScale, CockroachDB, or Turso
```

## Comparison

| Database | Best For | Trade-offs |
|----------|----------|------------|
| **PostgreSQL** | Full features, extensions | Requires hosting/management |
| **Neon** | Serverless PostgreSQL | Branching, scale-to-zero |
| **Turso** | Edge, low latency | SQLite limitations |
| **SQLite** | Simple, embedded, local | No multi-writer |
| **PlanetScale** | Global MySQL scale | No foreign keys |

## Questions to Ask

1. Where will the app be deployed?
2. How complex are the queries?
3. Do you need edge/serverless?
4. Do you need vector search?
5. Is global distribution needed?
