# Legacy Orca migrations — HISTORICAL / TEST FIXTURES ONLY

**This is not an active migration source. Never run Prisma against this directory.**

These 83 migrations are the pre-baseline Orca migration chain. The schema-truth audit
recorded in `docs/ORCA_CLEAN_DATABASE_BASELINE.md` established that this chain **cannot
reliably reconstruct the current schema**, so replaying it would produce a database that
does not match `apps/orca/prisma/schema.prisma`.

They are retained for two reasons only:

1. **Historical evidence** of how the schema reached its current shape.
2. **Test fixtures** — schema regression tests read individual `migration.sql` files to
   assert that a given change was additive, carried the right constraints, and did not
   drop data.

## Where the active sources live

| Purpose | Path |
|---|---|
| Active schema | `apps/orca/prisma/schema.prisma` |
| Active migration source (clean baseline) | `apps/orca/prisma/baseline/` |
| Historical chain (this directory) | `apps/orca/test-fixtures/legacy-orca-migrations/` |

`apps/orca/prisma/` deliberately contains **no `migrations/` directory**, so neither
`prisma.config.ts` nor a bare `prisma migrate` invocation can discover this chain. To
initialise a new, empty database, use the baseline:

```bash
DATABASE_URL=<new-empty-db> npx prisma migrate deploy --config prisma.baseline.config.ts
```

Migrations authored after the baseline belong in `apps/orca/prisma/baseline/`, so a new
database keeps one coherent forward-only chain.
