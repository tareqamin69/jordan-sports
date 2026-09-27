# M1 — Identity & tenancy

- **Status:** Complete (2026-09-27)
- **Scope (architecture §Z):** auth spike and implementation, sessions, organizations, memberships,
  permissions, admin bootstrap, audit log.
- **Done when:** authorization matrix and isolation tests; OTP and rate-limit tests.

## What was built

| Area | Delivered |
|---|---|
| Auth decision | Better Auth spike failed (fake emails for phone users) → in-house module, [ADR-0017](../adr/0017-in-house-authentication.md) |
| Database | Migration `0002`: restricted application role `js_app`, schemas `identity`, `tenancy`, `audit`, `platform`; append-only audit log (grants + trigger) |
| Player sign-in | Phone OTP (Jordanian formats normalized), 5-min codes stored as HMAC, 5 attempts, sign-up with name + 16+ confirmation, 30-day revocable sessions |
| OTP delivery | `OtpSender` interface; development console channel only (refused in production); dev-only endpoint to read the latest code |
| Platform staff | Email + Argon2id password + mandatory TOTP, single-use codes, 8-hour sessions, created only via CLI (`pnpm --filter @jordan-sports/api admin:create`) |
| Security | Origin allow-lists (web vs admin), Redis rate limits (fail closed), problem-details errors, no secrets in logs or error bodies |
| Tenancy | Organizations, memberships (owner/manager/staff), code-defined permission bundles, tenant authorization helper returning 404 to non-members |
| Admin API + UI | Organizations (create with owner by phone, add members), users (search, suspend/reactivate with reason; suspension revokes sessions), audit log |
| Web UI | Sign-in / sign-up flow (Arabic + English), account page (name, phone, organizations), header account link |
| Contracts | Endpoint registry shared by API and clients; typed fetch client; OpenAPI 3.1 at `/v1/openapi.json` |
| Types | Kysely types generated from the migrated schema (`db:codegen`); CI fails if they drift |

## How it was verified

| Check | Result |
|---|---|
| API unit tests | 57 passed (TOTP RFC vectors, crypto, phone normalization, permissions, config safety, migrator, logger) |
| API integration tests (real Postgres + Redis) | 38 passed (OTP lockout/expiry/rate limits, single-use tokens, hashed secrets, sign-out, CSRF origins, admin TOTP replay, role permissions, org creation + owner sign-up, suspension, `js_app` cannot modify audit logs or run DDL) |
| E2E (Chromium, mobile + desktop) | 48 passed (player sign-up in Arabic, sign-out, wrong-code error, admin sign-in with TOTP, organization creation, audit log, redirects, accessibility) |

## Not in M1 (by design)

- No real SMS/WhatsApp delivery (provider not chosen); the UI says so on the sign-in page.
- Venue scoping of staff memberships (per-venue access) arrives with venues in M2.
- Row-level security policies arrive with the first tenant-private tables (venue customers, M5).
- No admin UI to create other admins (CLI only, by design for now).

## Notes

- Rate limits in tests are isolated per phone/IP; e2e clears only rate-limit counters before a run.
- Client IP for rate limiting comes from the proxy chain; the trusted-proxy configuration must be
  set for the real hosting setup (tracked for M9).
