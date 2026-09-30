# 0018. CliQ straight to the venue, commission from a prepaid balance

- **Status:** Superseded by [0020](./0020-card-only-payments-merchant-of-record.md) (2026-09-30):
  card-only payments; the CliQ flow, the prepaid balance and `FEATURE_CLIQ_PAYMENTS` were removed.
- **Date:** 2026-09-28
- **Related:** [plan §4–§5](../plans/jordan-wide-cliq-marketplace.md), [0005](./0005-booking-state-model.md),
  [0006](./0006-money-and-ledger.md), [0008](./0008-tenancy-and-row-level-security.md),
  supersedes the collection model assumed by [0015](./0015-manual-payouts.md)

## Context

The owner decided (plan §8) that the platform never holds player money: players pay the venue
directly by CliQ, and the platform earns a commission. Card gateways are deferred. We need a flow
that works with no payment API at all (CliQ transfers are confirmed by a human at the venue), that
cannot charge the commission twice, and that stops a venue from taking bookings it hasn't prepaid
commission for — without ever blocking a player who has already paid.

## Decision

- **Payments** live in `payment.payments`, one row per marketplace booking at a venue that has a
  CliQ alias, separate from booking status (ADR-0005). States: `AWAITING_PROOF → SUBMITTED →
  CONFIRMED`, or `EXPIRED` / `CANCELLED`; a venue's "not received" moves `SUBMITTED` back to
  `AWAITING_PROOF` with a reason. The amount is the deposit (venue %, default 20%, half-up to the
  fils; 0% or 100% means the full price, since every online booking needs a payment — D5).
- The booking stays `HELD` until the venue confirms. The hold is `venue.payment_hold_minutes`
  (30); sending proof extends it by the same again (D1). The existing expiry sweep closes the
  payment, and opens one system dispute when proof had been sent (unique per payment, so several
  workers can sweep).
- **One transfer, one booking:** a unique index on `(organization_id, reference_key)`, where the
  key ignores case, spaces and separators.
- **Commission** (`venue.commission_bps`, default 800 = 8% of the full price, half-up once) is
  posted in the same transaction that confirms the payment. Booking rows are locked before
  payment rows everywhere, so confirmation and expiry serialize: exactly one wins.
- **Ledger:** append-only `finance.balance_entries` (`topup`, `commission`,
  `commission_reversal`, `adjustment`) with `balance_after`, and a cached `finance.balances` row
  locked and updated in the same transaction. A unique index on `(booking_id, kind)` makes the
  commission and its reversal idempotent. Both tables are tenant-private (RLS).
- **Refunds** (D2, D3): a paid booking cancelled by the venue, or by the player inside the free
  window, returns the commission and marks the deposit `refund_status = DUE` until the venue marks
  it refunded. Late cancellations and no-shows keep both.
- **Visibility** (D4, D2 escalation): a CliQ venue is listed, bookable and holdable only while its
  organization's balance is above zero and no refund has been due for 48 hours. The check is one
  `SECURITY DEFINER` SQL function returning a boolean, so public (tenant-less) search never reads
  balances. The confirmation that takes a balance below zero is always allowed.
- Venues without a CliQ alias keep the pay-at-venue flow and are not gated (transitional: legacy
  and demo venues).

## Consequences

- No money custody, payouts or gateway contracts are needed at launch.
- Correctness depends on locks and unique indexes, not application checks; integration tests cover
  double confirmation, confirmation racing expiry, duplicate references and ledger sums.
- A CliQ venue is invisible until its first credit. Admins credit balances by hand (audited) until
  the venue top-up flow exists.
- Defaults (deposit, commission, threshold, 48 hours) are code constants until the platform
  settings screen exists; the 48 hours is duplicated in the SQL function and must change in both.

## Alternatives considered

- **Charge commission from the player at checkout:** needs a gateway and custody; rejected by the
  owner.
- **Invoice venues monthly:** simpler to build, but the platform carries credit risk and has no
  lever against non-payment; the prepaid balance was chosen (plan §5).
- **A booking state for "awaiting venue":** would leak payment concerns into the booking state
  machine (ADR-0005); the payment row carries it instead.

## Switched off (2026-09-28)

The owner moved to a card gateway (MEPS). The CliQ code stays behind the `PaymentProvider`
abstraction, disabled by `FEATURE_CLIQ_PAYMENTS=false` (the default):

- no payment rows are created; every booking is pay-at-venue;
- the balance/overdue-refund visibility gate is bypassed, so no venue is hidden for its balance;
- `GET /v1/catalog` returns `features.cliqPayments`; the web hides the CliQ fields in the
  registration wizard (the step becomes "Contact"), the owner's Payments and Balance tabs and the
  balance banner; admin hides the balance card. Saved CliQ values are kept, not cleared.
- Tests: `payments.test.ts` runs with the flag on; `payments-disabled.test.ts` covers the default;
  `tests/e2e/specs/cliq.spec.ts` skips itself unless the API reports the feature on.

A MEPS adapter should be a second `PaymentProvider`; the ledger and commission code can be reused
if the commission model stays prepaid.
