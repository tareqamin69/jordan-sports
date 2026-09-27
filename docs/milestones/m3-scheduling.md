# M3 — Scheduling

- **Status:** Complete (2026-09-27)
- **Scope (architecture §Z):** schedules, exceptions, holidays, blocks, occupancy constraint,
  availability engine, read-only calendar.
- **Done when:** property tests; time-zone and business-day tests; split/combined overlap tests.

## What was built

| Area | Delivered |
|---|---|
| Database | Migration `0004`: `scheduling` schema — weekly hours (venue-local, may cross midnight), date overrides (closed / special hours, venue-wide or per resource), public holidays (data), blocks, and **`occupancies` with the exclusion constraint** (ADR-0004) |
| Availability engine | Pure function (`modules/scheduling/domain/availability.ts`): opening windows → business day (configurable start) → overrides/holidays → aligned slots per allowed duration → lead time / advance window → busy time with buffers. IANA time zones via Luxon |
| Occupancy | Single write path with savepoints; exclusion violations become `SCHEDULE_CONFLICT` (never retried); expired holds ignored even before release |
| Public API | `GET /v1/venues/:slug/availability?date=` — slots with UTC instants and venue-local labels |
| Venue dashboard API (`/v1/manage/*`) | Managed venues, schedule (hours, rules, overrides, role permissions), weekly hours, booking rules, overrides, holiday opt-in, blocks (create/remove), day calendar with entries (including time taken through a combined resource) |
| Authorization | Every venue-scoped operation authorizes against the venue's organization in the database; non-members get 404; staff can block time but not change hours or rules |
| Web `/manage` | Venue list; dashboard with **Calendar** (day grid per court, previous/next/today, block time with reason and note, remove block), **Opening hours** (per court, copy to all, closing after midnight), **Booking rules** (durations, start interval, notice, advance days, buffers), **Closures** (whole venue or court, closed or special hours, public-holiday opt-in) |
| Admin | Public holidays page (dates entered as data) |
| Demo data | Demo venues get default opening hours |

## How it was verified

| Check | Result |
|---|---|
| Unit tests (API) | 73 passed — availability engine: alignment, durations, busy/buffers, lead/advance, midnight-crossing windows, business-day split, overrides (resource beats venue), holidays, **DST spring-forward/fall-back** (Europe/Berlin as a DST zone), and a **property test** (300 random schedules: available slots never overlap busy time and always lie inside opening hours) |
| Integration tests | 60 passed — hours → slots, overlapping windows rejected, blocking a half removes the slot from the half and the full pitch but not the other half, full-pitch block over a blocked half → 409, **20 simultaneous blocks → exactly 1 succeeds**, closure/special hours/holiday behaviour, role enforcement, **tenant isolation on every `/manage` endpoint (404)** |
| E2E | 58 passed — owner signs in, sets hours, blocks a phone booking in the calendar, the public availability loses the slot immediately, removing the block restores it; accessibility check on the dashboard |

## Not in M3 (by design)

- Prices on slots (M4) and booking (M5); the public venue page does not show slots yet.
- The hours editor sets one opening window per day (the API supports several).
- Week view and drag-to-select in the calendar (M7 polish); monthly view is deferred (§A.1).
- Recurring blocks/bookings arrive with bookings (M5).
