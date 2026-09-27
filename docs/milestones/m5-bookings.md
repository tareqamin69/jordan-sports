# M5 — Bookings

- **Status:** Complete (2026-09-27)
- **Scope (architecture §Z):** hold → confirm (pay at venue) → cancel, venue manual and weekly
  bookings, notifications through the outbox, background worker.
- **Done when:** concurrent holds for one slot → exactly one wins; idempotent retries; expiry.

## What was built

| Area | Delivered |
|---|---|
| Database | Migration `0006`: `booking.bookings` (lifecycle, payment status and attendance kept separate — ADR-0005; money in minor units; price and cancellation-policy snapshots), `booking_items`, append-only `status_history`, `series`, `venue_customers` protected by **row-level security** (ADR-0008), `platform.idempotency_keys`, `platform.outbox_events`, `notification.deliveries`, `venues.cancellation_cutoff_hours` |
| Hold | `POST /v1/bookings` (Idempotency-Key required): only times the venue offers (hours, alignment, lengths, lead/advance), must be priced, max 2 active holds per player, 10-minute hold (venue policy). Stale holds on the same units are expired in the same transaction; the exclusion constraint decides the winner |
| Confirm | `POST /v1/bookings/:id/confirm` (idempotent): pay at venue + explicit acceptance of the cancellation terms; expired hold → `HOLD_EXPIRED` |
| Cancel | Player: release a hold, or cancel before start (late flag after the venue's cutoff, default 24 h, no penalty). Venue: cancel with a reason shown to the player |
| Venue side | **Bookings** tab: list by date range with customer name + phone (own bookings only), cancel with reason, add phone / walk-in bookings with optional weekly repeat (taken weeks are skipped and reported), free-cancellation hours setting. Calendar shows customer names |
| Player side | Tap a time → sign in if needed (returns to the venue) → confirmation page with countdown and terms → confirmed page with reference; **My bookings** (upcoming / past) |
| Admin | **Bookings** page across venues (explicit, audited RLS bypass) |
| Notifications | Transactional outbox (ADR-0007) + dispatcher (SKIP LOCKED, backoff, dead-letter after 10 attempts, one delivery per event/recipient/template). Arabic/English templates; only a **console** channel until an SMS/WhatsApp provider is chosen |
| Worker | `main.worker.ts`: outbox every 2 s, hold expiry every 15 s, completion every 60 s, `/healthz` on `WORKER_PORT` (4001). Safe to run several |

## How it was verified

| Check | Result |
|---|---|
| API unit tests | 89 passed (references, cancellation window, lifecycle transitions, message rendering incl. Arabic Western digits and `25.000 د.أ`) |
| API integration tests | 74 passed (9 bookings: **50 concurrent holds → exactly 1 success, 49 `SLOT_UNAVAILABLE`**; idempotent replay and key reuse; hold limit; not-offered times; expiry frees the slot and blocks confirmation; free vs late cancellation; weekly series skipping a taken week; RLS on venue customers; tenant isolation; venue cancellation notifies the player exactly once; completion; admin paging) |
| E2E | 66 passed (book → confirm → My bookings → cancel in English; release a hold in Arabic on mobile; venue adds a 4-week phone booking, duplicate refused, cancels one; admin list) |

## Also in this milestone

- Fix: on phones in Arabic the venue page was wider than the screen and time buttons overlapped
  (found by the mobile e2e test).
- Test-only `RATE_LIMIT_SCALE` (refused in production): all e2e browsers share one IP.

## Not in M5 (by design / open)

- Online payment, refunds, commission, tax: **M6, waiting for the owner's decision**.
- Check-in / no-show buttons for venues (fields exist; UI later).
- Real SMS/WhatsApp delivery (provider not chosen); messages are logged and stored.
