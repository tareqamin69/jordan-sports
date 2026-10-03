# P10 — Marketplace polish (owner requests N1–N5, 2026-10-03)

- **Status:** shipped to staging 2026-10-03.

## N1 — Sport-neutral tagline (shipped)

- Home: "لعبتك، وقتك، ملعبك." / "Your game. Your time. Your court." with a multi-sport subtitle.
- Copy scan (AR/EN, metadata, OG images, SMS): general contexts no longer assume football; the
  hero/OG pitch art lost its football penalty boxes.

## N2 — Sports shown where they can be booked (shipped)

- Catalog: `offeredSportIds` sorted by approved-venue count, plus `sportVenueCounts`.
- Home + search dropdown + venue chips: only sports with ≥ 1 approved venue (a sport appears by
  itself when its first venue is approved). `/sports` lists all; empty ones are muted tiles linking
  to `/manage/register` ("عندك ملعب {sport}؟ سجّله").

## N3 — Location first (shipped)

- In-page card (never the raw browser prompt first); the prompt only after "use my location".
- Granted: "nearest to you" row (distance + next free times today); search defaults to nearest.
  Denied/later: one-tap governorate chips; remembered. Choice in localStorage (`jorena-place`);
  the position stays in memory on the device, never sent. API `located=1` filter. Privacy and
  cookie texts updated (`LEGAL_TEXTS_VERSION` 2026-10-03).

## N4 — Venue review notifications (shipped)

- Outbox `venue.submitted` (new submission or owner edit back to review) → email to platform
  owners + support email, SMS/WhatsApp text to the support WhatsApp, with a direct link
  `ADMIN_BASE_URL/ar/venues/<id>`. Admin nav shows a pending count badge (refreshed every minute).

## N5 — Import a venue from a Google Maps link (shipped)

- Module `apps/api/src/modules/venue-import`: `POST /v1/manage/venue-import` (owner wizard) and
  `POST /v1/admin/venue-import` (`venues.edit`). Both return pre-fill data only; nothing is saved.
- Tier 1 (always, free): short links (`maps.app.goo.gl`, `goo.gl/maps`) followed through HTTP
  redirects only: HTTPS, Google host allowlist at every hop (general Google hosts only on `/maps`
  paths), ≤ 5 hops, 5 s, DNS answers checked against private ranges at connect time (SSRF), page
  bodies never read. Parse the place name and pin (`!3d!4d` preferred over `@lat,lng`, then
  `q`/`query`/`ll`/`center`), governorate by distance to our governorate centres, nearest area by
  existing venues within 5 km.
- Tier 2 (only with `GOOGLE_PLACES_API_KEY`): Places API (New) Text Search with a field mask (id,
  name, address, phone, website, opening hours, location); Redis cache 30 days; daily cap
  `GOOGLE_PLACES_DAILY_CAP` (30) counted per Amman day; any failure → tier 1 silently. Opening
  hours become weekly windows applied to each court the owner adds in the wizard.
- Per-user rate limit 20/hour. Unreadable link → 422 `MAP_LINK_UNREADABLE`, shown as a soft note;
  the manual form always continues.
- Photos are never copied from Google; the photos step now takes several files at once and has
  earlier/later reordering (first = cover).
- Owner guide (Arabic): [`docs/google-places-setup.md`](../google-places-setup.md).

## Fixed along the way

- Self-registration slugs used the first 8 characters of a UUIDv7 as the "random" suffix; those are
  the clock, so two Arabic-only venue names registered in the same minute collided ("web address
  already in use"). Now 4 random bytes.
- `qa.spec.ts` updated to the N2 rules (home = sports with venues; `/sports` muted tiles).

## Deferred / open

- `place_id` is returned to the client but not yet stored on the venue (no column); add one if we
  later want to refresh details from Google.
- Website from Places is returned but there is no venue website field yet.
- Admin import pre-fills name/governorate/area/pin/address/phone; it does not set court hours
  (courts are created later in the venue page).
