# 0005. Booking state split into lifecycle, payment, attendance and dispute

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §A.1, §G](../architecture.md#g-booking-concurrency-strategy)

## Context

The specification lists booking states `DRAFT, HELD, PENDING_PAYMENT, CONFIRMED, CHECKED_IN,
IN_PROGRESS, COMPLETED, CANCELLED, REFUND_PENDING, REFUNDED, NO_SHOW, DISPUTED`. These mix four
independent dimensions (lifecycle, money, attendance, disputes) plus one derived from the clock. A
single enum allows impossible or ambiguous combinations (e.g. a checked-in booking that is also
refund-pending and disputed).

## Decision

- **`booking.status`** (lifecycle): `HELD → CONFIRMED | EXPIRED | CANCELLED`;
  `CONFIRMED → COMPLETED | NO_SHOW | CANCELLED`. Terminal: `EXPIRED`, `CANCELLED`, `COMPLETED`,
  `NO_SHOW` (NO_SHOW reversible by admins only, audited).
- **`booking.payment_status`** (derived from payment records and kept in sync transactionally):
  `NOT_REQUIRED | UNPAID | PAID | PARTIALLY_REFUNDED | REFUNDED`; `PARTIALLY_PAID` added with split
  payments. Pay-at-venue bookings are `UNPAID` with method `PAY_AT_VENUE` until collection is recorded.
- **Attendance:** `checked_in_at`, `checked_in_by`.
- **Disputes:** a separate `disputes` entity referencing the booking; it never mutates booking status.
- `IN_PROGRESS` is computed from the clock; `DRAFT` exists only on the client.
- Every lifecycle transition is a guarded compare-and-set (`UPDATE … WHERE status = $expected`),
  performed with the booking row locked when other rows change in the same transaction, and appended to
  `booking_status_history`.

## Consequences

- Each dimension has a small, testable state machine; illegal combinations cannot be represented.
- Reports and UI combine dimensions explicitly (e.g. "Confirmed · Unpaid · Checked in").
- The mapping from the specification's names is documented here for product discussions.

## Alternatives considered

- **Single enum as specified:** simpler to display, but ambiguous and error-prone for refunds and
  disputes.
- **Event-sourced bookings:** strong auditability, but heavy for the MVP; the status history table plus
  audit log provides the needed traceability.
