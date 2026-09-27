# 0004. Occupancy on atomic resource units, guarded by an exclusion constraint

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §F, §G, §H](../architecture.md#g-booking-concurrency-strategy)

## Context

Two confirmed customers must never hold the same exclusive resource for overlapping time, under any
concurrency. Time can be occupied by marketplace bookings, temporary holds, venue manual/external
bookings, and blocked time (maintenance, closures, private events). Some resources combine or split:
a full football pitch may be bookable as a whole or as two halves, and booking the whole must block
both halves (and vice versa). Frontend checks are not acceptable protection.

## Decision

- Every bookable resource maps to one or more **resource units** (`resource_unit_map`). By default a
  resource has exactly one unit; a full pitch maps to units A+B and each half maps to A or B.
- All time consumption is stored as rows in **`occupancies`** — one row per unit — with
  `kind` (`hold` | `booking` | `block`), `during tstzrange '[)'` (including buffers), `active`, and
  `expires_at` for holds.
- The database enforces non-overlap:
  `EXCLUDE USING gist (unit_id WITH =, during WITH &&) WHERE (active)`.
- Holds: inserted with `expires_at = now() + hold length` (default 10 minutes). Because `now()` cannot
  appear in a constraint predicate, expired holds are released **lazily** inside the next overlapping
  hold transaction and **periodically** by a worker job.
- Violations (`SQLSTATE 23P01`) map to `409 SLOT_UNAVAILABLE` and are not retried.

## Consequences

- Double booking is impossible at the database level regardless of application bugs or race timing.
- Split/combined resources and multi-sport shared surfaces are handled by the same mechanism.
- Blocks and manual bookings get the same guarantee as marketplace bookings, so the marketplace stops
  showing time as soon as a venue records it.
- Availability reads must treat holds with `expires_at < now()` as free even before they are released.
- Capacity-based resources (shared lanes, classes) need a different mechanism later (`booking_mode`).

## Alternatives considered

- **Application-level checks with `SELECT … FOR UPDATE` / advisory locks:** correct only if every code
  path remembers to lock; the constraint cannot be forgotten.
- **Redis distributed locks:** Redis is not a source of truth; lock expiry and failover create gaps.
- **Discrete slot rows (one row per slot) with unique constraints:** simple, but breaks with variable
  durations, buffers and alignment changes.
- **SERIALIZABLE isolation for all booking transactions:** works but causes broad retries; the
  exclusion constraint is narrower and cheaper.
