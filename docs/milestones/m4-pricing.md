# M4 — Pricing

- **Status:** Complete (2026-09-27)
- **Scope (architecture §Z):** bands, special periods, quotes, snapshots, preview.
- **Done when:** deterministic quote tests.

## What was built

| Area | Delivered |
|---|---|
| `packages/money` | Integer minor units only (JOD = fils); half-up percentage applied once (BigInt); largest-remainder allocation; strict parsing of entered prices (incl. Eastern Arabic digits); approved display format `25.000 د.أ` / `JOD 25.000` |
| Database | Migration `0005`: `pricing.price_rules` (business-day bands, weekday sets, optional special-period dates, priority) and `price_rule_amounts` (price per booking length, `bigint` minor units). Rules are immutable: changes archive and recreate |
| Quote engine | Pure (`modules/pricing/domain/quote.ts`): the band containing the slot **start** (ADR-0014) on the business day (late-night bands such as Thursday 22:00–02:00), special periods > priority > most recent; a rule applies only to the lengths it prices |
| Public availability | Now includes the price of each slot; unpriced times are not shown to players |
| Venue dashboard | **Prices** tab: bands per court with weekdays, times (past midnight), priority, label, optional special period, a price per booking length; remove band; **price preview** |
| Public venue page | "Available times" for the next 7 days with prices (read-only until M5 booking) |
| Demo data | Demo venues get prices with a peak band |

## How it was verified

| Check | Result |
|---|---|
| `packages/money` tests | 26 passed (format, parsing incl. round-trip property, arithmetic guards, half-up rounding, allocation property: parts always sum to the total) |
| API unit tests | 83 passed (7 quote tests: band match, start-band rule across boundaries, late-night bands, Friday–Saturday weekend sets, special periods, recency tie-break, no price) + deadlock retry tests |
| API integration tests | 65 passed (5 pricing: hidden until priced, band/duration/start pricing, special period precedence, preview, immutable replace, validation, roles and tenant isolation) |
| E2E | 60 passed (owner creates a band in the UI with input validation, preview shows `JOD 25.000`, public page shows `JOD 25.000` / `25.000 د.أ`) |

## Also in this milestone

- **Fix (M3):** concurrent conflicting inserts can deadlock under the exclusion constraint; occupancy
  transactions now retry 40P01/40001 up to three times (architecture §G). Found by CI.

## Not in M4 (by design / open)

- Service fees, commission and tax lines: open money questions (before M6). Quotes currently have a
  single base line; the snapshot format leaves room for more lines.
- Price snapshots are stored with bookings in M5.
