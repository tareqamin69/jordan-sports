# Jordan Sports

A Jordan-focused sports participation and booking marketplace with venue operating software.
"Jordan Sports" is a working name.

> **Status: M0 (foundations).** The repository contains the monorepo, tooling, CI, the database
> migration runner, health endpoints, and Arabic/English (RTL/LTR) skeletons of the web and admin
> apps. **No product features exist yet** — there is no sign-in, venue, availability or booking
> functionality. See [`docs/milestones/`](docs/milestones/) for what each milestone delivered.

## Documentation

- [Architecture](docs/architecture.md) — the approved product and technical architecture
- [Architecture decision records](docs/adr/README.md)
- [Development guide](docs/development.md) — local setup, commands, conventions
- [Milestones](docs/milestones/)

## Repository layout

```
apps/api            NestJS API (modular monolith), SQL migrations, health endpoints
apps/web            Next.js marketplace (+ venue dashboard under /manage, later)
apps/admin          Next.js platform admin (separate origin)
packages/i18n       Locale config and Arabic/English message catalogs
packages/ui         Design tokens, fonts, base styles
packages/contracts  zod API contracts shared by API and clients
packages/config     Shared TypeScript presets
tests/e2e           Playwright end-to-end tests
infra/docker        Local development infrastructure (Postgres + PostGIS, Redis)
scripts             Repository checks (RTL safety, sport-agnostic core)
```

## Quick start

Requirements: Node.js 22 (≥ 22.12), pnpm 10, Docker with Compose.

```bash
cp .env.example .env
pnpm install
pnpm infra:up          # Postgres 16 + PostGIS and Redis on localhost
pnpm build
pnpm db:migrate
pnpm dev               # web :3000, admin :3001, api :4000
```

Then open http://localhost:3000 (redirects to `/ar`) and http://localhost:3001.
API health: http://localhost:4000/healthz and http://localhost:4000/readyz.

See the [development guide](docs/development.md) for tests and conventions.
