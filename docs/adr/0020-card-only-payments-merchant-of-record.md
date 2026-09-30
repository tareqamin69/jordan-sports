# 0020. Card-only payments, Jorena as merchant of record, weekly payouts

- **Status:** Accepted
- **Date:** 2026-09-30
- **Related:** supersedes [0018](./0018-cliq-direct-payments-and-prepaid-commission.md) and the
  collection model of [0013](./0013-test-payment-provider.md); builds on [0006](./0006-money-and-ledger.md),
  [0015](./0015-manual-payouts.md), [0005](./0005-booking-state-model.md)

## Context

The owner's final payment decision (2026-09-30): card only (Visa/Mastercard), the full amount paid
online at booking. Jorena collects, keeps its commission and pays the rest to the venue. No
pay-at-venue, no CliQ, no venue prepaid balance. **We launch only when the card gateway is live.**
The gateway (MEPS or a bank acquirer) is not chosen yet, so staging needs a working stand-in.

## Decision

- **Flow:** select slot → hold → pay by card on the gateway's hosted page → confirmed. Starting the
  checkout extends the hold to at least 15 minutes. The booking is confirmed only when the gateway
  reports success (on return via `verify`, or by the worker's `reconcile-checkouts` job for players
  who never come back; attempts pending for 60 minutes are abandoned).
- **Gateway port** (`modules/payments/domain/gateway.ts`): `createCheckout` / `getCheckout` /
  `refund`, hosted checkout only, so card numbers never reach our servers. We keep only the brand
  and last 4 digits. `PAYMENT_GATEWAY=mock` (the only implementation for now) serves a test page on
  the web app (`/[locale]/pay/test/[sessionId]`) with test cards; production config refuses it
  unless `STAGING=true`, and preflight fails while it is configured. Adding the real gateway means
  adding one implementation of the port.
- **Transactions:** `payment.transactions` records every charge and refund (kind, status, amount,
  gateway reference, card brand/last4, failure code, refund reason, attempts). Gateway calls happen
  outside database transactions. Refunds are recorded in the cancelling transaction and sent after
  commit; the worker retries them (5 attempts, then `failed` with an admin retry). A payment that
  succeeds after its hold was lost is fully refunded (reason `expired`).
- **Refund rules** (`payment-rules.ts`), snapshotted on the booking at hold time:
  cancel inside the venue's free window → 100%; late cancel → the venue's `late_refund_percent`
  (0/50/100); venue or admin cancels → 100%; no-show → 0. Players see "5–10 business days".
- **Commission:** `commission_bps` is snapshotted on the booking at hold time.
  gross = paid − refunded; commission = percentOf(gross, bps); net = gross − commission (fils).
- **Payouts:** weekly, every Sunday (Asia/Amman) for bookings settled (played, ended or cancelled)
  before that week. Admin records the bank transfer with its reference; `finance.payouts` and
  `finance.payout_items` (booking id as primary key) are append-only, so a booking is paid out
  once. The mark-paid call carries the net amount the admin saw (`expectedNet`), refused if it changed.
  Payouts go to the organization's IBAN (`finance.payout_accounts`, ISO 13616 checksum), set by the
  owner only (`payouts.manage`); the audit log keeps only its last 4 characters.
- Manual (phone/walk-in) bookings are `NOT_REQUIRED` payments: no commission, no payout.

## Consequences

- Staging is fully testable end-to-end with test cards; production cannot start on the mock.
- Jorena is the merchant of record: legal and acquirer terms must match (see `docs/legal/README.md`).
- Venue UI "الرصيد" becomes "المستحقات" (per booking gross/commission/net, schedule, history);
  admin gets payouts, payments and refunds screens.
- CliQ tables and history stay in the database (migration 0026 keeps them); no UI or API uses them.

## Alternatives considered

- **CliQ to the venue with a prepaid commission balance (ADR-0018):** no gateway needed, but manual
  confirmation, disputes, and a balance venues must keep topped up. Rejected by the owner.
- **Pay at the venue:** no-shows and no commission collection. Rejected.
- **Automatic payouts via a split-payment gateway:** depends on the gateway chosen; revisit then.
