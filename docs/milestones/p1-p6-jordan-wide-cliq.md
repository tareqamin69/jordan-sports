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

Remaining items from the list (in order): free-cancellation deadline display, header logo on hero
pages, hero art layering, per-sport venue illustrations, "(تجريبي)" on all demo venues, PWA
install-prompt timing, public footer, owner-dashboard tabs hidden pre-approval, performance/
Lighthouse pass, Arabic map labels, and an in-page cancel-booking confirmation dialog. Cancelling
the owner's test booking `LULBBS94` on staging is blocked: the staging URL isn't discoverable
anywhere in this repo or the session environment — needs the owner to share it or cancel it
themselves.
