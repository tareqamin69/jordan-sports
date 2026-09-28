# 0019. Releans as the SMS provider

- **Status:** Accepted (adapter built and tested against a fake; not yet switched on)
- **Date:** 2026-09-28
- **Related:** [0009](./0009-authentication.md), [0007](./0007-postgres-jobs-outbox-redis-cache.md)

## Context

Sign-in codes and booking messages need real SMS. The owner chose Releans (Jordanian, direct
operator routes). A sender ID ("Jorena") must be approved by the operators, which needs a
commercial registration, so the provider cannot be switched on yet.

## Decision

- `platform/sms/releans.ts` is the only code that talks to Releans. Two thin adapters use it:
  `ReleansOtpSender` (the identity module's `OtpSender`) and `ReleansNotificationChannel` (the
  outbox dispatcher's `NotificationChannel`). Nothing else changes.
- Selected by `OTP_CHANNEL=releans` with `RELEANS_API_KEY` (required), `RELEANS_SENDER_ID`
  (default `Jorena`), `RELEANS_BASE_URL`. The `console` channel stays for development and staging.
- Failures: the OTP request answers 503 `SERVICE_UNAVAILABLE` (never a 500, never the code);
  outbox messages retry with the existing backoff. Errors and logs never contain the message text,
  the key or the whole number.
- Tests use `test/support/fake-releans.ts`, a local HTTP server, as the sandbox.

## Consequences

- The request shape (form fields, bearer key, digits-only number) follows Releans' documented
  send call but was **not verified against the real service** (no key yet). First switch-on:
  run `node dist/cli/sms-test.js +9627XXXXXXXX` with the real key and adjust `toGatewayNumber` /
  the client if the gateway differs.
- WhatsApp later means another `NotificationChannel`/`OtpSender`; routing between them is not
  built.
