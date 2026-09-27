# 0017. In-house authentication module instead of Better Auth

- **Status:** Accepted
- **Date:** 2026-09-27
- **Supersedes:** the library choice in [ADR-0009](./0009-authentication.md) (its methods and
  security requirements still apply)

## Context

ADR-0009 chose Better Auth subject to an M1 spike. The spike (better-auth 1.7.6) found that its
phone-number plugin requires every phone sign-up to create a user with an email address
(`signUpOnVerification.getTempEmail`), i.e. fake emails for phone-only players. Better Auth also
owns its table layout (user/session/account/verification) and identifiers, which conflicts with our
SQL-first, schema-per-module database ([ADR-0002](./0002-kysely-sql-first-migrations.md),
[ADR-0003](./0003-postgresql-extensions-and-schemas.md)) and UUIDv7 keys.

## Decision

Implement a small authentication module in `apps/api/src/modules/identity`:

- **Phone OTP:** 6-digit codes from a CSPRNG, stored only as HMAC-SHA256 (keyed with
  `AUTH_SECRET`), 5-minute expiry, 5 attempts per code, rate limits per phone and IP (Redis).
  New phones receive a one-time sign-up token after verification; the account is created only when
  the player gives a name and confirms they are 16 or older.
- **Sessions:** opaque 256-bit tokens in `HttpOnly; SameSite=Lax` cookies; only the SHA-256 is
  stored; server-side revocation; 30-day web sessions, 8-hour admin sessions.
- **Platform staff:** email + Argon2id password + mandatory TOTP (RFC 6238, verified against the RFC
  test vectors) with single-use codes; TOTP secrets encrypted at rest (AES-256-GCM, key derived from
  `AUTH_SECRET`). Staff accounts are created only by a CLI.
- **CSRF:** Origin allow-lists per surface (web vs admin) on every state-changing request.
- **OTP delivery:** `OtpSender` interface; the development console channel is the only
  implementation until an SMS/WhatsApp provider is chosen and is refused in production.

## Consequences

- No fake email addresses; the data model matches the product (phone-first players).
- We own a security-sensitive component: it is covered by unit tests (TOTP vectors, crypto,
  phone normalization) and integration tests (lockout, expiry, replay, revocation, rate limits,
  origin checks). A security review of this module is part of M9.
- Bearer tokens for a future mobile app are a small addition (same session table).

## Alternatives considered

- **Better Auth with temporary emails:** works technically but pollutes the user model and fights
  our schema conventions.
- **Hosted identity providers:** add a third-party processor for personal data and constrain OTP
  provider choice in Jordan.
