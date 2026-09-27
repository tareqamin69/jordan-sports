# 0007. Postgres job queue and transactional outbox; Redis only for cache and rate limits

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §B, §G](../architecture.md#g-booking-concurrency-strategy)

## Context

Side effects (notifications, search updates, report aggregation) must happen if and only if the
state change that caused them committed. Background work (hold expiry, payment reconciliation) must be
reliable. Redis may be used where justified but must never be the source of truth for bookings or
payments.

## Decision

- Background jobs run on **graphile-worker** (a job queue stored in PostgreSQL) in the API's worker
  process.
- A **transactional outbox** (`outbox_events`) is written in the same transaction as the domain change;
  the worker dispatches events to handlers with at-least-once delivery, and handlers are idempotent.
- **Redis** is used only for rate limiting and short-lived caches. Losing Redis must never lose or
  corrupt a booking or payment.

## Consequences

- No "confirmed but never notified" or "notified but rolled back" states.
- One fewer critical stateful dependency; Postgres load increases slightly (acceptable at MVP scale).
- If job throughput outgrows Postgres, a broker can be introduced behind the same outbox.

## Alternatives considered

- **BullMQ on Redis:** mature and fast, but enqueueing is not atomic with database commits and it makes
  Redis critical infrastructure.
- **pg-boss:** comparable to graphile-worker; graphile-worker chosen for its low-latency LISTEN/NOTIFY
  design. Either can be swapped behind the outbox dispatcher.
