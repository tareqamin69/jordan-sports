# 0002. Kysely with SQL-first migrations

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §F](../architecture.md#f-database-architecture), [ADR-0003](./0003-postgresql-extensions-and-schemas.md), [ADR-0004](./0004-occupancy-exclusion-constraint.md)

## Context

The integrity of bookings and payments depends on database features: exclusion constraints on
`tstzrange`, `btree_gist`, PostGIS geography columns, partial and expression indexes, row-level
security policies, triggers (balanced ledger entries), `SELECT … FOR UPDATE`, and precise control of
transactions and isolation levels. ORMs that own the schema tend to express these poorly or not at all.

## Decision

- The database schema is defined in **plain SQL migration files** (`apps/api/migrations/NNNN_name.sql`),
  forward-only, reviewed like code.
- A small in-repo migration runner applies pending files in order, each in its own transaction, under
  a Postgres advisory lock, recording name + SHA-256 checksum in `public.schema_migrations`. It refuses
  to run if an already-applied migration file was modified or removed.
- Queries use **Kysely** (typed SQL query builder). Database types are generated from the real,
  migrated schema (kysely-codegen) once tables exist, never hand-maintained.
- Raw SQL via Kysely's `sql` template is allowed where it is clearer; string concatenation of values is
  never allowed.

## Consequences

- Every integrity feature is expressed directly and reviewed in SQL.
- Types always match the real schema because they are generated from it.
- Developers need to be comfortable with SQL; there are no auto-generated migrations from model diffs.
- Down-migrations are not supported; mistakes are fixed forward (expand/contract).
- Statements that cannot run inside a transaction (e.g. `CREATE INDEX CONCURRENTLY`) will need an
  explicit runner directive when first required.

## Alternatives considered

- **Prisma:** excellent DX, but weak support for range types, exclusion constraints and PostGIS
  (`Unsupported` types, hand-edited migrations); its query engine hides locking behaviour.
- **Drizzle:** good TypeScript schema DSL, but the same integrity features would still need
  hand-written SQL migrations alongside a TypeScript schema that could drift from them.
- **Third-party migration tools (node-pg-migrate, dbmate, graphile-migrate):** viable; the in-repo
  runner is ~150 lines, has no extra runtime, and gives us checksum verification and readiness checks
  on our own terms. Can be swapped later without changing the SQL files.
