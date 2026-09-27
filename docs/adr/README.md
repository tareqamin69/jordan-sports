# Architecture Decision Records

Each significant architectural decision is recorded as an ADR: the context, the decision, its
consequences and the alternatives considered. ADRs are immutable once accepted; a later decision that
changes one is recorded as a new ADR that **supersedes** it (and the old ADR's status is updated to
point at the new one).

To add a decision, copy [`template.md`](./template.md) to `NNNN-short-title.md` using the next number.

| ADR | Title | Status |
|---|---|---|
| [0001](./0001-modular-monolith.md) | Modular monolith with NestJS API and two Next.js frontends | Accepted |
| [0002](./0002-kysely-sql-first-migrations.md) | Kysely with SQL-first migrations | Accepted |
| [0003](./0003-postgresql-extensions-and-schemas.md) | PostgreSQL 16 with extensions and a schema per module | Accepted |
| [0004](./0004-occupancy-exclusion-constraint.md) | Occupancy on atomic resource units, guarded by an exclusion constraint | Accepted |
| [0005](./0005-booking-state-model.md) | Booking state split into lifecycle, payment, attendance and dispute | Accepted |
| [0006](./0006-money-and-ledger.md) | Money as integer minor units with a double-entry ledger | Accepted |
| [0007](./0007-postgres-jobs-outbox-redis-cache.md) | Postgres job queue and transactional outbox; Redis only for cache and rate limits | Accepted |
| [0008](./0008-tenancy-and-row-level-security.md) | Organization as tenant; application enforcement plus row-level security | Accepted |
| [0009](./0009-authentication.md) | Better Auth, phone OTP for players, mandatory 2FA for admins | Accepted |
| [0010](./0010-rest-openapi-zod-contracts.md) | REST with OpenAPI generated from zod contracts | Accepted |
| [0011](./0011-locale-urls-and-translated-content.md) | Locale-prefixed URLs and translated content in jsonb | Accepted |
| [0012](./0012-pnpm-turborepo.md) | pnpm workspaces and Turborepo | Accepted |
| [0013](./0013-test-payment-provider.md) | Test payment provider for development and tests only | Accepted |
| [0014](./0014-price-by-start-band.md) | Price a slot by the band in which it starts | Accepted |
| [0015](./0015-manual-payouts.md) | Manual payouts in the MVP | Accepted |
| [0016](./0016-custom-resource-calendar.md) | Custom day/week resource calendar | Accepted |
