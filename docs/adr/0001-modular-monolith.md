# 0001. Modular monolith with NestJS API and two Next.js frontends

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §B, §D, §E](../architecture.md#b-architecture-overview)

## Context

The platform has clear domain boundaries (identity, tenancy, catalog, venues, resources, scheduling,
pricing, bookings, payments, finance, notifications, audit, search) but a small team and an MVP to
ship. It needs server-rendered public pages for SEO, a venue dashboard, an admin platform, webhooks,
background jobs, and a stable API that a future native mobile app can consume. The specification asks
for a modular monolith rather than microservices.

## Decision

- **`apps/api`**: a single NestJS application (Fastify adapter) containing every domain module under
  `src/modules/<module>/{domain,application,infrastructure,http}`. It has two entrypoints built from
  the same code: `main.http.ts` (HTTP API) and `main.worker.ts` (background jobs).
- **`apps/web`**: Next.js (App Router) for the public marketplace and the venue dashboard under
  `/manage`. It talks to the API over HTTP through a same-site `/api` proxy.
- **`apps/admin`**: a separate Next.js application on its own origin for platform administrators.
- Domain code in `domain/` is framework-free. Modules interact only through each other's public
  `index.ts` (enforced by lint rules) and through domain events via the transactional outbox.

## Consequences

- One deployable backend image, one database, local transactions across modules where atomicity
  matters (e.g. booking + occupancy + ledger).
- Modules can be extracted into services later because their boundaries, tables (one Postgres schema
  per module) and public interfaces are explicit.
- The mobile app can reuse the same versioned REST API.
- Three deployables (api, web, admin) instead of one; the web app must forward session cookies to the
  API on the server side.
- NestJS relies on decorator metadata, so the API is compiled with `tsc` (and tested through SWC),
  not with a type-stripping runner.

## Alternatives considered

- **Next.js only (route handlers / server actions):** fewer deployables, but ties domain logic, jobs
  and webhooks to a frontend framework and gives mobile clients no clean API.
- **Plain Fastify with hand-built modules:** lighter, but module structure, dependency injection and
  guards would need to be re-invented and kept disciplined by convention alone.
- **Microservices:** unjustified operational cost at this scale; distributed transactions would make
  booking/payment integrity harder, not easier.
- **Venue dashboard as a third Next.js app:** more isolation but duplicated auth/i18n plumbing; the
  dashboard shares the player's account and session, so it lives in `apps/web`.
