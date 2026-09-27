# 0008. Organization as tenant; application enforcement plus row-level security

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §K](../architecture.md#k-multi-tenancy)

## Context

Venue management is multi-tenant: one venue must never access another's private data (customers,
manual bookings, revenue, payouts, staff). Some operators run several venues (branches). The same person
may be both a player and venue staff. Authorization must be enforced on the server and database, never
trusted from the client.

## Decision

- **Organization** is the tenant; it owns venues. **Memberships** link users to organizations with a
  role and an optional venue scope. Staff capability comes only from memberships.
- **Primary enforcement (application layer):** tenant context is derived server-side from the session
  and memberships, never from request input. Tenant-scoped queries go through a helper that requires
  `organization_id`; each use case calls a central `authorize(actor, action, resource)` that loads the
  resource's owning organization from the database.
- **Defense in depth (database layer):** PostgreSQL **row-level security** on tenant-private tables. The
  tenant helper sets `SET LOCAL app.org_id` within the transaction; policies compare against it. Worker
  and admin paths use explicit, audited bypass roles.
- An automated **tenant isolation test suite** calls every venue-scoped endpoint as a member of another
  tenant and expects `404`.
- Approved data sharing: venues see a marketplace player's **name and phone only for bookings at their
  venue**.

## Consequences

- A single missed `WHERE organization_id = …` in application code does not leak data from RLS-protected
  tables.
- Every tenant-scoped transaction must go through the helper (lint rule + review).
- RLS adds some complexity to connection handling (`SET LOCAL` per transaction) and to testing.

## Alternatives considered

- **Application-only enforcement:** simpler, but one bug can leak tenant data.
- **Database per tenant / schema per tenant:** strong isolation but heavy operations and cross-tenant
  marketplace queries become impractical.
- **Venue as tenant (no organization):** breaks for multi-branch operators and shared staff.
