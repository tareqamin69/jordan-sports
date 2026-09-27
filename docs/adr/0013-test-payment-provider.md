# 0013. Test payment provider for development and tests only

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §I](../architecture.md#i-payments-money-and-ledger)

## Context

The payment provider is not yet selected, but the booking and payment lifecycle (holds, confirmation,
webhooks, duplicates, late success, refunds) must be built and tested now. The project rules forbid
faking functionality to users.

## Decision

- Implement a real `TestPaymentProvider` that satisfies the `PaymentProvider` interface, including
  signed webhooks, delayed/duplicate/out-of-order delivery and failure injection.
- It is used **only** in automated tests and local development, enabled by explicit configuration.
- The API **refuses to start** when `NODE_ENV=production` and the test provider (or any dev-only
  adapter, such as the console OTP channel) is enabled.
- It is never presented to users as a payment method in any deployed environment. Until a real
  provider exists, deployed environments offer **pay-at-venue** only.

## Consequences

- Payment flows are exercised end-to-end in CI without external dependencies.
- Adding a real provider means writing an adapter and running the same lifecycle test suite against it.

## Alternatives considered

- **Provider sandbox only:** depends on a provider not yet chosen and on network access in CI.
- **Mocking at call sites:** hides integration bugs; the adapter boundary is the right seam.
