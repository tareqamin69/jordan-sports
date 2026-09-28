# P1–P6 — Jordan-wide marketplace, two interfaces, self-registration, CliQ payments, prepaid commission

Tracks implementation of `docs/plans/jordan-wide-cliq-marketplace.md` (approved 2026-09-27, all §8
decisions resolved — see that file for the decided values, including the owner's D2 addition:
48-hour refund escalation). Read that plan file first for the full design; this doc tracks
what's shipped so a new session can resume without re-reading everything.

## Status

| Phase | Status |
|---|---|
| P1 — Jordan-wide geography + full sports catalog | **Done (2026-09-27)** |
| P2 — Two interfaces, mode switch | **Done (2026-09-28)** |
| P3 — Venue self-registration wizard, review queue | **Mostly done** (wizard + review queue; platform settings screen and "chat with us" button still open) |
| P4 — CliQ payment flow | **Core loop done (2026-09-28)**; receipts, player/venue problem reports, admin disputes list open |
| P5 — Prepaid balance & commission | **Core done (2026-09-28)**; venue top-up requests, admin balances overview, overdue-refunds list open |
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

## Post-P1 fixes and additions (2026-09-27, same day)

- **Staging auto-update was silently broken**: the cron daemon isn't installed on the Hetzner
  Ubuntu image, so `/etc/cron.d/jordan-sports` never ran and the site stayed on whatever commit
  was live at bootstrap. Switched `infra/staging/bootstrap.sh` to a systemd timer
  (`jordan-sports-update.timer`, every 5 min) instead — systemd is always present. Confirmed
  working via `systemctl list-timers` on the box.
- **More areas per governorate** (migrations 0009, 0010): every governorate now has 5+ areas
  (was as few as 3); Amman alone has 50. Sourced first from Jordan's official district structure,
  then from the owner's own governorate-by-governorate list — deduped by normalizing Arabic
  (hamza, ta marbuta, the "ال" article) and English spelling so re-submitted names don't create
  near-duplicate rows. `GET /v1/catalog` now sorts areas alphabetically by Arabic name (governorates
  keep `sort_order`).
- **3 more sports** (migration 0011): beach volleyball, futsal/indoor football, running track —
  17 sports total in the catalog now (was 14).
- **Demo venues for 6 previously-unoffered sports**: `seed-demo.ts`/`demo-venues.json` gained a
  `governorate` field per venue (was hardcoded to Amman for every demo venue) and 4 new demo
  venues — Amman (basketball + badminton), Irbid (squash), Zarqa (volleyball), Aqaba (beach
  volleyball + swimming) — all named "(تجريبي)"/"(Demo)" in both languages. Staging now shows 9
  offered sports (football, padel, tennis, basketball, badminton, squash, volleyball, beach
  volleyball, swimming) instead of 3.
- **New `/sports` page** ("كل الرياضات"): lists every sport with at least one approved venue,
  each tile linking to `/venues?sport=<key>`. Linked from the site header nav. Added to
  `sitemap.ts`.
- The "Design B — Clubhouse" redesign was deferred here; it has since shipped (see below).
- Verification: API unit+integration 169/169, full Playwright e2e 68/68, `pnpm lint` clean, full
  typecheck clean.

## Clubhouse redesign (2026-09-27)

Every screen re-skinned to design direction B ("Clubhouse"); full spec in
`docs/design-system.md`. Tokens/fonts/components live in `packages/ui` (Amiri added via
`@fontsource/amiri`). Web: new header + single `MainNav` (floating dark pill on mobile), hero +
floating search card home with sport tiles, editorial picks, governorate chips and owner block;
photo-first venue page (full-bleed swipe gallery, title over the photo); restyled slot picker,
checkout (floating sticky confirm bar), confirmation, My bookings, sign-in, account, search
results (sport chip filter), all-sports, 404, owner dashboard (pill tabs), admin (same tokens,
simpler).

- Home hero copy changed to the reference voice ("العب أحلى، احجز أسهل." / "Play better. Book
  easier."); `web.spec.ts` updated accordingly.
- Venue page: the old fixed mobile quick-action bar was removed (it collided with the bottom nav);
  Book / Call / Directions / Share are now inline pills under the price.
- Owner block CTA links to `/manage` (not "register your venue") because self-registration is P3.
  Switch it to the registration wizard when P3 lands.
- **Deferred / open:** real venue photos (illustrated placeholders until uploaded); no "favourites"
  button (reference had one, feature doesn't exist); desktop hero art is illustrative only — swap
  for a real photo when the owner provides one.
- Verification: lint, typecheck, `check:repo`, unit, integration 79/79, Playwright e2e 68/68
  (mobile + desktop, incl. axe AA checks).

## Post-Clubhouse polish (2026-09-28)

Owner feedback from the redesign, all fixed:

1. **Sport icons**: volleyball redrawn (was too close to basketball's cross-seam look); futsal got
   its own icon instead of reusing football's exact one (migration 0012).
2. **Venue map**: replaced the openstreetmap.org iframe (rendered as an empty grey box in
   practice) with a real MapLibre GL map — OSM raster tiles, no API key, a pin, zoom controls.
3–4. **Checkout**: added a back button; found and fixed why the floating bottom nav rendered
   pinned to the *top* of every non-overlay page instead of the bottom (the sticky header's
   `backdrop-blur-md` made it the CSS containing block for the nav's `fixed` positioning on
   mobile — moved the frosted background to a `::before` layer). Also dropped the entrance
   animation on the checkout wrapper (same containing-block issue) and added a layout spacer so
   the "release this time" link can't slide under the now-correctly-fixed confirm bar. Net effect:
   home/venue pages were never affected by the nav bug; checkout/confirmation lost their extra
   defensive bottom padding along with it.
5. Swept the whole app for other empty/placeholder boxes; the map was the only one.
6. **Renamed the platform to Jorena / جورينا.** New `packages/brand` (`BRAND_NAME`,
   `BRAND_NAME_LATIN`) is the single source every surface reads from: UI copy, notification
   templates, OpenAPI title, the admin TOTP issuer, the `.ics` PRODID, the PWA manifest.
7. **Web is now an installable PWA**: icons (192/512/maskable + apple-touch), `app/manifest.ts`
   (standalone, Arabic/RTL `start_url`), a service worker (installability + fast static-asset
   reloads + an offline fallback screen — deliberately never caches pages/API responses), and a
   real install prompt (`beforeinstallprompt` on Android/Chrome, an instructional hint on iOS
   Safari). Surfaced and fixed a real, pre-existing a11y bug along the way: the overlay header's
   language-switcher chip didn't reliably meet color-contrast over the hero photo's lighter
   regions.

Verification after every step: lint, typecheck, `check:repo`, unit (90/90), integration (79/79),
full Playwright e2e (68/68, mobile + desktop, axe AA). Each item landed as its own commit, pushed
to both `claude/dazzling-feynman-iryb1r` and the staging branch
`claude/inspect-repo-environment-c0iptd` (staging auto-deploys from the latter every 5 minutes).

## P2 — two interfaces, one account (2026-09-28)

Implements plan §2 in full. See the commit message on `feat(P2): two interfaces, one account` for
the detailed change list (migration 0013 `preferred_mode`, sign-up mode question, header switch,
`VenueNav` shell, venue switcher, account page card, rewritten empty state).

**Deliberately deferred to P3**: "Add your venue" from the empty `/manage` state has no button —
the self-registration wizard doesn't exist yet. The empty-state hint says so honestly ("once you
join an organization or register your venue…") instead of linking to something that isn't built.
Wire it up when P3 lands.

**Design decision**: `preferred_mode` is write-once at signup (no endpoint to change it later).
The runtime "switch" is pure navigation (`/` ⇄ `/manage`), matching the plan's "presentation
only, anyone can switch" — nothing needs to persist across sessions for that to work.

Verification: lint, typecheck, check:repo, unit (90/90), integration (79/79), full Playwright
e2e (68/68, mobile + desktop, axe AA).

Next up: P3 (venue self-registration wizard, review queue with call/WhatsApp, platform settings,
"chat with us" button).

## Staging bug-fix pass (2026-09-28)

Owner did a full manual test on staging and filed a numbered list (CRITICAL/IMPORTANT/MINOR),
fixed in order, one commit per item, pushed to both `claude/dazzling-feynman-iryb1r` and staging
(`claude/inspect-repo-environment-c0iptd`) after each.

1. **Venue self-registration wizard** (this doubles as P3's wizard — done ahead of schedule).
   New owner-facing multi-step wizard at `/manage/register`: info → location (governorate/area,
   address, draggable MapLibre pin) → photos → courts → payment/contact (WhatsApp, CliQ alias +
   holder name, deposit %) → review & submit. Creates a `draft` venue on step 1, edits it via
   `PATCH /v1/manage/venues/:id` through the remaining steps, then `POST .../submit` moves it to
   `submitted`. Hours/pricing stay on the existing `/manage/[venueId]` dashboard tabs (reused
   as-is — editing while in review is allowed per the plan). Admin gets a cross-org review queue
   at `/venues` (`GET /v1/admin/venues?status=`) with owner name/phone and call/WhatsApp
   (`tel:`/`wa.me`) links; approve/reject-with-reason reuses the existing venue editor's status
   panel. The venue dashboard now shows a status banner (draft/submitted/rejected/suspended) with
   a link back into the wizard to continue or resubmit. Migration 0014 adds
   `cliq_alias`/`cliq_alias_holder`/`deposit_percentage`/`whatsapp_phone`/`status_reason` to
   `venue.venues`; `rejected → submitted` is now a valid transition (resubmit without going
   through `draft`).
   - Bug found and fixed while smoke-testing the wizard end to end: the register endpoint passed
     `slug: ''` to `VenuesService.create` instead of generating one, which fails the venue table's
     slug format constraint on every single registration. Now generates a real slug the same way
     `OrganizationsService.createForUser` already did (`slugify(name.en ?? name.ar)`).
   - Verification: lint, typecheck, `check:repo`, unit (90/90), integration (79/79), full
     Playwright e2e (68/68, mobile + desktop, axe AA), plus a manual Playwright smoke run of the
     full register → submit → admin-approve flow (written, run, and removed — not part of the
     committed suite).

Items 2–9 from the list are fixed (free-cancellation deadline display, header logo on hero pages,
hero art layering, per-sport venue illustrations, "(تجريبي)" on all demo venues, PWA install-prompt
timing, public footer, owner-dashboard tabs hidden pre-approval) — see the commit log on
`claude/dazzling-feynman-iryb1r` for one commit per item.

**Item 12 (cancel-booking confirmation) needed no code change**: both the player's cancel button
(`booking-view.tsx`) and the owner's (`bookings-panel.tsx`) already show an in-page two-step
confirmation (a "بدك تلغي؟" card with confirm/keep buttons, or a reason field + confirm button) —
never `window.confirm`. Verified against the existing e2e coverage in `bookings.spec.ts`, which
already drives that exact flow (`Cancel booking` → `Yes, cancel`).

**Item 11 (Arabic map labels)**: switched `VenueMap` and the registration wizard's `LocationPicker`
from raster OpenStreetMap tiles (labels baked into the tile image, no way to switch script) to
OpenFreeMap's free, keyless "Liberty" vector style, with `localizeMapLabels()` pointing every
label at `name:ar`/`name:en` (falling back to the untagged `name`) once the style loads. Falls
back to the old raster tiles if the vector style can't be reached. This sandbox's egress policy
blocks both tile hosts outright (confirmed with a direct `curl`), so this could only be verified
structurally (typecheck/lint/build, and that the map still finishes loading via the fallback path
instead of hanging) — worth a visual check on staging.

**Item 10 (performance)**: profiled with Lighthouse (mobile) rather than guessing. Lazy-loaded
`VenueMap` (MapLibre GL, ~200KB, was in the venue page's initial bundle even though the map sits
below the booking widget) via `next/dynamic({ ssr: false })`, and added `"sideEffects": false` to
`@jordan-sports/contracts` (zod schemas for every domain, no `sideEffects` field meant bundlers
couldn't tree-shake endpoints a given page never calls). Home page's score is ~82–83 in this pass,
short of the 90+ target; the remaining weight is mostly self-hosted webfonts (Arabic pages still
render Latin digits/prices, so both scripts' weights load) and baseline Next/React JS — neither
has a safe, scoped fix without a bigger refactor, so flagging as follow-up rather than risking a
broad, untested change under time pressure. The venue page's own Lighthouse number is additionally
skewed low in this sandbox by the blocked tile hosts above (unrelated to the app's code) — re-check
on staging for a clean read.

All 12 items from the bug list have now been addressed (11 with a code change, item 12 verified as
already correct) — see the commit log on `claude/dazzling-feynman-iryb1r` / staging
(`claude/inspect-repo-environment-c0iptd`) for one commit per item, each with full validation
(lint, typecheck, `check:repo`, unit 90/90, integration 79/79, full Playwright e2e 68/68).

**Two things still need the owner directly**, since neither is reachable from this session:
1. Cancelling the test booking `LULBBS94` on staging — the staging URL isn't discoverable anywhere
   in this repo or the session environment.
2. Staging's *already-seeded* demo venues won't pick up the items 5/6 fixes (correct photos, the
   "(تجريبي)" suffix) from a code push alone, since `seed:demo` skips venues that already exist —
   needs either a reseed or a direct data fix on staging.

## Second owner manual test — owner-side fixes (2026-09-28)

All 12 items fixed and pushed (items 1–6 in one commit because they all live in the wizard, 7–8
together, then one commit each): wizard map centres on the governorate and warns when the pin is
outside it; styled bilingual photo-upload button; CliQ alias is a text field; validation errors
sit under the exact field; the review step shows everything; courts can be edited and removed;
venue card shows "قيد المراجعة", no duplicate name, and the cover photo; onboarding checklist
(hours, prices, rules, photos) and a "set opening hours first" calendar state; "apply to all
courts" + "copy to all days" in working hours; booking card art matches the booked sport; more
room between the hero art and the Arabic subtitle; translated map-marker labels.

The item-8 changes altered the dashboard for venues without hours, which broke two assertions in
`manage.spec.ts` (found in the full e2e run below and fixed: the test now expects the new empty
state and clicks tabs by exact name).

## P4/P5 core — CliQ payments and the commission balance (2026-09-28)

Design and rationale: [ADR-0018](../adr/0018-cliq-direct-payments-and-prepaid-commission.md).

**Shipped**
- Migration `0015_cliq_payments_and_ledger.sql`: `payment.payments`, `payment.disputes`,
  `finance.balances`, `finance.balance_entries` (append-only, RLS), `venue.commission_bps` (800),
  `venue.payment_hold_minutes` (30), `finance.org_takes_online_bookings()`.
- API: hold creates the CliQ payment (deposit, payee snapshot, 30-minute hold);
  `POST /v1/bookings/:id/payment-proof`; venue `GET /v1/manage/venues/:id/payments`,
  `POST /v1/manage/payments/:id/{confirm,reject,refunded}`; `GET /v1/manage/venues/:id/balance`;
  admin `GET/POST /v1/admin/organizations/:id/balance[/adjustments]` (new `finance.read` /
  `finance.manage` permissions). Expiry sweep closes payments and opens the D1 dispute. Player and
  venue cancellations return the commission and mark the deposit refund due. Search, venue page,
  availability and holds hide CliQ venues with an empty balance or a refund overdue 48 hours.
- Web: CliQ checkout (deposit, remainder, alias + copy, the Arabic steps, reference field,
  countdown, "waiting for the venue" state polled every 10 s), paid/refund lines on the booking;
  owner dashboard "Payments" tab (confirm / not received with reason / mark refunded, polled every
  20 s) and "Balance" tab with history; low/empty/overdue banner on every tab (CliQ venues only).
- Admin: balance card on the organization page (level, visibility, credit/debit with reason,
  history).
- Outbox events `payment.submitted|rejected`, `dispute.opened`, `refund.due`, `balance.low|empty`
  are recorded but not delivered (no SMS/WhatsApp provider yet).

**Tests** — unit `test/unit/finance.test.ts` (deposit and commission rounding, property tests for
bounds, exact deposit + remainder, monotonic commission, balance levels, reference keys) and
integration `test/integration/payments.test.ts` (24 tests): expired hold (before/after the sweep,
no dispute, slot freed); duplicate reference (cosmetic variants refused, retries allowed, other
organizations allowed); venue never confirms (dispute opened once, no commission, player can't
walk away while pending); venue can't confirm/reject after the deadline; confirmation racing
expiry; six concurrent confirmations → one commission; "not received" then resend; tenancy of
payment actions; refunds in the free window, late cancellation, venue cancellation, 48-hour
overdue hiding; empty balance hides the venue but manual bookings still work; low-balance event
once; the confirmation that goes below zero is allowed and then the venue hides; top-up restores
it; append-only + RLS on the ledger; admin adjustment permissions, validation and audit; cached
balance = sum of entries after every flow. Two deliberate bugs were planted to check the suite
catches them (it did). E2E `tests/e2e/specs/cliq.spec.ts` drives the whole flow in the browser.

**Deferred (next)**
- Receipt upload with private storage (reference only for now).
- "Report a problem" for players/venues and the admin disputes list (disputes table exists; only
  the automatic D1 dispute is created).
- Venue top-up requests (amount + CliQ reference + receipt → admin approves). Until then admins
  credit balances by hand from the organization page.
- Admin: balances overview with low/empty filters, "refunds overdue" list, per-venue commission
  edit, platform settings screen for the defaults.
- No-show button for venues; sound/vibration badge for pending payments.

**Open decisions for the owner**
1. A 0% deposit is treated as "full price now" (D5 says every online booking needs a payment).
   Alternative: forbid 0% in the wizard.
2. Venues without a CliQ alias (demo and admin-created) still use pay-at-venue and aren't gated.
   D5 removes pay-at-venue — decide when to require an alias for every venue.
3. Venue staff (not just owners/managers) can confirm payments (`booking.manage`). Restrict?
4. On staging, venues registered through the wizard have a CliQ alias and a zero balance, so they
   are hidden from search until an admin credits them from the organization page.
