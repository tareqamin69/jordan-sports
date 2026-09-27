# 0015. Manual payouts in the MVP

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §I, §Q](../architecture.md#i-payments-money-and-ledger)

## Context

If the platform collects money on behalf of venues, it must pay them out. The payment provider, fund
custody model and payout schedule are still open, and automated payout APIs depend on the provider.

## Decision

- The system generates **payout statements** per organization and period from the ledger (venue
  payable balance, bookings, refunds, commission).
- An admin performs the bank transfer **outside the system** and records the payout (amount, date,
  bank reference); the system posts the corresponding ledger entry.
- No automated payout integration is built or claimed in the MVP.

## Consequences

- Payouts are auditable from day one without committing to a provider's payout API.
- Manual operational work for finance admins; acceptable for a pilot.

## Alternatives considered

- **Automated payouts via provider:** blocked on provider selection and fund-custody decision.
- **No payout tracking:** unacceptable for auditability.
