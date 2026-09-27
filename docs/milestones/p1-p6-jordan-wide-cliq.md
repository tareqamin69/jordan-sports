# P1–P6 — Jordan-wide marketplace, two interfaces, self-registration, CliQ payments, prepaid commission

Tracks implementation of `docs/plans/jordan-wide-cliq-marketplace.md` (approved 2026-09-27, all §8
decisions resolved — see that file for the decided values, including the owner's D2 addition:
48-hour refund escalation). Read that plan file first for the full design; this doc tracks
what's shipped so a new session can resume without re-reading everything.

## Status

| Phase | Status |
|---|---|
| P1 — Jordan-wide geography + full sports catalog | **Done (2026-09-27)** |
| P2 — Two interfaces, mode switch | Not started |
| P3 — Venue self-registration wizard, review queue | Not started |
| P4 — CliQ payment flow | Not started |
| P5 — Prepaid balance & commission | Not started |
| P6 — Gateway questions doc (done, in the plan §Appendix B), full e2e run, ADRs | Not started |

## P1 — done

Migration `apps/api/migrations/0008_geography_and_sports.sql`: all 12 governorates + their main
areas (table/column names kept legacy: `catalog.cities`, `city_id`), 11 new sports with formats,
resource types, and resource_type↔format mappings, plus the `catalog.sport_requests` table
(schema only — see deferral note below).

**Renamed "city" → "governorate" at the application layer** (DB names unchanged) across:
contracts (`packages/contracts/src/catalog.ts`, `venues.ts`), `CatalogService`, `VenuesService`,
`DirectoryService`/controller, `ViewsService`, seed/test fixtures, web (`search-bar.tsx`, home
page, venues pages, venue-card), admin (`venue-editor.tsx`, `venue-list.tsx`).

**Full sports catalog** — 14 sports total (football, padel, tennis, basketball, volleyball,
squash, badminton, table tennis, billiards/snooker, swimming, gym, bowling, handball, martial
arts/boxing), each with icon, ar/en name, formats, resource type. `offeredSportIds` on
`GET /v1/catalog` (players only see sports with ≥1 approved venue offering it) — computed via SQL
join over sport_formats → resource_formats → active resources → approved venues.

**Admin CRUD (no release needed for new data)**: `apps/admin/src/components/geography.tsx` +
`/geography` route — create/rename governorates, create/rename areas (governorate-scoped),
create sports (with first format + resource type) and rename them. Backed by 6 new
`auth: 'admin'` endpoints in `apps/api/src/modules/catalog/http/admin-catalog.controller.ts`.

**Bug found and fixed during this work**: `CatalogService`'s 60s in-memory cache held
`offeredSportIds` but nothing invalidated it when a venue was approved or a resource's
status/sport-formats changed — a newly-approved venue's sport could stay hidden from players for
up to 60 seconds. Fixed by making `CatalogService.invalidate()` public and calling it from
`VenuesService.setStatus()` and `ResourcesService.create()`/`update()`.

**Deliberately deferred to P3** (not yet reported to the user before this doc — flag in the P1
report): the "owner requests a new sport during registration, admin approves" workflow. Only the
`catalog.sport_requests` DB table exists; the submission endpoint and admin approve/reject queue
UI are not built, since there is no self-service venue-owner UI yet for them to submit from (that
arrives with the P3 self-registration wizard).

**Verification**: API unit 90/90, API integration 79/79 (incl. new `geography.test.ts`), full
Playwright e2e suite green (one stale hardcoded-copy assertion in `web.spec.ts` — "in Amman" — was
updated to match the new Jordan-wide home page copy), `pnpm lint` clean, full typecheck clean
across api/web/admin.

Next up: P2 (two interfaces / sign-up mode question / player ↔ venue-owner mode switch on one
account).
