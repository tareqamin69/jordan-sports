# 0009. Better Auth, phone OTP for players, mandatory 2FA for admins

- **Status:** Accepted; library choice superseded by [ADR-0017](./0017-in-house-authentication.md) after the M1 spike
- **Date:** 2026-09-27
- **Related:** [architecture §L](../architecture.md#l-authentication-and-authorization)

## Context

Players in Jordan are expected to sign in with their phone number; the SMS/WhatsApp provider is not yet
chosen. Venue staff and platform admins need stronger authentication. Sessions must be revocable, work
for the web now and for a native mobile app later, and never rely on client-side authorization.
Minimum player age is 16.

## Decision

- **Library:** Better Auth, mounted in the API, with sessions stored in PostgreSQL. An M1 spike must
  confirm: phone-OTP support, custom OTP delivery hook, organization/membership fit (or our own
  tenancy module), bearer-token support for mobile, and compatibility with NestJS/Fastify and our
  SQL-first schema. If the spike fails, we implement a minimal session module ourselves (opaque tokens,
  Argon2id, Postgres sessions) — recorded as a superseding ADR.
- **Players:** phone OTP (E.164, +962 default). OTP delivery goes through an abstraction; until a
  provider is chosen, a **development console channel** logs codes locally. The application refuses to
  start in production with the console channel enabled. Age 16+ captured at sign-up.
- **Venue staff:** phone or email sign-in; TOTP 2FA strongly recommended for owners/managers.
- **Admins:** email + password (Argon2id) + mandatory TOTP, admin origin only, short sessions.
- **Cookies:** `HttpOnly; Secure; SameSite=Lax`, same-site `/api` proxy; CSRF defended by SameSite,
  Origin checks and CSRF tokens on mutations.
- **OTP safeguards:** rate limits per phone and IP, attempt caps, short expiry, no account enumeration.

## Consequences

- OTP provider can be chosen later without touching auth flows.
- An M1 spike is required before committing to the library.

## Alternatives considered

- **Auth.js:** oriented to Next.js; less natural in a separate API with mobile clients.
- **Hosted identity providers:** fast to start, but add a third-party data processor for personal data
  and limit phone-OTP provider choice in Jordan.
- **Custom session module:** feasible fallback; more security surface to own.
