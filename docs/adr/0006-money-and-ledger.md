# 0006. Money as integer minor units with a double-entry ledger

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §I](../architecture.md#i-payments-money-and-ledger)

## Context

The initial currency is JOD, which has three decimal places (1 JOD = 1000 fils). Prices, fees,
commissions, discounts, refunds, payouts and split shares must be exact, deterministic and auditable.
Floating point is forbidden.

## Decision

- Amounts are stored as **`bigint` minor units** with a `char(3)` currency code; in TypeScript they are
  integers handled only through a `Money` value object in `packages/money` (never raw arithmetic in
  feature code). The number of minor units per currency comes from a currency table (JOD = 3).
- Rates are integers in **basis points**.
- **Rounding:** each percentage calculation is rounded exactly once, **half-up to the minor unit**.
  Derived amounts are obtained by subtraction (e.g. venue net = total − commission − fees) so totals
  never drift.
- **Allocation** (split shares, partial refunds across lines) uses the **largest-remainder** method with
  a deterministic tie-break (participant order); the organizer absorbs the remainder by default. Parts
  always sum exactly to the whole.
- **Display** never changes stored values. Approved formats: Arabic `25.000 د.أ`, English `JOD 25.000`,
  Western digits.
- A **double-entry ledger** (`ledger_accounts`, `journal_entries`, `postings`) exists from the MVP. A
  trigger rejects unbalanced journal entries. Postings are written in the same transaction as the
  payment/refund/payout state change they record. The ledger is append-only.
- One currency per venue; a booking never mixes currencies.

## Consequences

- Venue revenue, platform revenue, refunds and payouts are reconstructable from the ledger alone.
- Commission and tax rules (still open questions) plug into posting templates without schema change.
- Slightly more work per money-moving feature (posting templates + tests).

## Alternatives considered

- **`numeric(12,3)` columns:** exact, but invites decimal arithmetic scattered across code and makes
  multi-currency minor units implicit.
- **No ledger in MVP (derive from payments):** faster initially, but retrofitting a ledger over live
  financial data is risky and error-prone.
- **Banker's rounding (half-even):** statistically unbiased, but harder to explain to venues; half-up
  applied once per calculation is transparent and auditable.
