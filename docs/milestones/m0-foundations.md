# M0 — Foundations

- **Status:** Complete, awaiting approval (2026-09-27)
- **Scope (from [architecture §Z](../architecture.md#z-development-milestones)):** monorepo, tooling,
  CI, compose, migration runner, i18n + RTL skeleton, design tokens, ADRs.
- **Done when:** CI green; empty web and admin render in Arabic and English with correct
  direction; `/healthz`; architecture docs.

## What was built

| Area | Delivered |
|---|---|
| Docs | `docs/architecture.md` (approved plan + approved decisions), ADRs 0001–0016, development guide |
| Monorepo | pnpm workspaces + Turborepo; ESM everywhere; shared TypeScript presets (`packages/config`) |
| Quality tooling | ESLint (TypeScript, Next.js, `react/jsx-no-literals`), Prettier, `scripts/check-rtl.mjs`, `scripts/check-sport-literals.mjs` |
| CI | GitHub Actions: format → repo checks → lint → build → typecheck → unit → migrate → integration → e2e, with a PostGIS service container |
| Local infra | `infra/docker/compose.yml`: Postgres 16 + PostGIS 3.4, Redis 7 (localhost-only ports) |
| API | NestJS 12 on Fastify; validated config; structured pino logging with redaction; server-generated request IDs; Kysely + pg pool; `GET /healthz` (liveness), `GET /readyz` (database + migrations) |
| Migrations | In-repo SQL migration runner (checksums, advisory lock, per-file transactions, modified/out-of-order detection), CLI (`db:migrate`, `db:status`), migration `0001_extensions.sql` (postgis, btree_gist, pg_trgm, citext) |
| i18n | `packages/i18n`: locales (`ar` default, `en`), directions, Western-digit `Intl` helper, typed ICU catalogs |
| Design system | `packages/ui`: design tokens (Tailwind v4 theme), self-hosted IBM Plex Sans Arabic / IBM Plex Sans, base styles |
| Contracts | `packages/contracts`: zod schemas for the health endpoints |
| Web / admin | Next.js 16 apps with next-intl: `/` → `/ar`, `/ar` (RTL) and `/en` (LTR), language switcher, localized 404, hreflang (web), `noindex` (admin), basic security headers. Pages state honestly that features are not available yet |

## How it was verified

| Check | Result |
|---|---|
| `pnpm format:check`, `pnpm check:repo`, `pnpm lint` | pass |
| `pnpm build`, `pnpm typecheck` | pass |
| Unit tests (`pnpm test`) | 41 passed (i18n 10, contracts 3, api 28) |
| Integration tests (`pnpm test:integration`, real PostGIS) | 14 passed |
| End-to-end (`pnpm e2e`, Chromium, mobile + desktop) | 36 passed |
| GitHub Actions CI | see the pushed branch's latest run |

Notable tests: migrations apply / idempotency / rollback / checksum / out-of-order / concurrency;
the occupancy exclusion-constraint pattern works on the real database (ADR-0004); PostGIS
distance; `/readyz` is 503 with pending migrations or an unreachable database, without leaking
details; log redaction of credentials and personal data; config errors never print values; RTL/LTR
layout order flips between Arabic and English; no automatic Accept-Language redirect; axe
accessibility checks (WCAG 2.x A/AA rules) in both locales.

## Not in M0 (by design)

- No domain modules, tables, authentication, venues, availability or bookings (M1+).
- No worker process yet (`main.worker.ts` arrives with the first background job, M5).
- No generated Kysely types yet (no tables); `kysely-codegen` is added in M1.
- No OpenAPI generation yet (first real endpoints in M1).
- No deployment Dockerfiles or hosting (before the first deployment; hosting is an open question).
- No Mailpit / object storage in compose (added in the milestones that use email and media).
- Redis runs locally but nothing uses it yet (rate limiting arrives in M1).
- No money package yet (M4); the approved price formats are recorded in the architecture.
- No schema drift check in CI yet (added once tables exist).

## Notes

- The brand name is **Jorena** / **جورينا**, decided 2026-09-27. It lives in one place,
  `packages/brand` (`BRAND_NAME`), and every message catalog, template and doc title reads from
  it — never hardcode the name again; see `docs/design-system.md`.
- TypeScript is pinned to 6.0.x because typescript-eslint does not yet support TypeScript 7.
