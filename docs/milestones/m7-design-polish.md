# M7 — Design polish ("alive" pass), phase 1: home, venue, booking

Goal: make the player-facing app feel premium and alive (Playtomic/Airbnb-level) without hurting
speed or RTL, keeping Design B "Clubhouse" tokens. Phase 1 covers the three key screens (home,
venue page, booking flow) plus the shared foundations, then **stops for the user's review** before
the rest of the app gets the same treatment.

## What shipped (phase 1)

### Foundations (`packages/ui`)
- `motion.css`: duration tokens (`duration-instant|fast|base|slow|slower`), easings
  (`ease-out-quart`, `ease-in-out`, `ease-spring`), animations (`animate-pop|fade|sheet|shimmer|draw`),
  and component classes: `.lift` + `.zoom-media` (card hover lift / photo zoom), `.pressable`
  (press feedback), `.skeleton`, `.reveal` / `.reveal-stagger` (CSS scroll-driven reveals,
  `animation-timeline: view()`), `.parallax-slow|fast` (scroll-timeline parallax), `.count-up`
  (CSS `@property` counter, no JS), `.confetti` (one-shot CSS burst).
  **CSS only — no animation library; added JS ≈ 0.** Everything is off with
  `prefers-reduced-motion` (base.css + guards); e2e runs with reduced motion.
- `Skeleton`, `SkeletonText`, `SkeletonGroup` (one `role=status` label for screen readers).
- `ToastProvider` + `useToast()` (max 3, auto-dismiss 3.8 s, above the mobile tab bar; `role=alert`
  for errors). Mounted in `apps/web/src/components/providers.tsx`.
- Chips/tiles/buttons: spring "pop" on select, snappier press scale.
- Fonts: dropped the 700 weights of IBM Plex Sans (Arabic + Latin); `font-bold` uses 600 (−70 KB).

### Images
- Venue photos: responsive WebP variants (`?w=320|640|960|1600`, generated lazily and cached by
  `platform/storage/image-variants.ts`), blur-up preview stored in `venue.media.blur`
  (migration 0025; backfilled on first read). Web `Photo` component renders `srcset` + blur + fade.
- Stock sport photos (fallback imagery): see `docs/image-credits.md`. Pexels only, downloaded and
  self-hosted by `node dist/cli/stock-photos.js` on the server during deploy (needs
  `PEXELS_API_KEY` in `/opt/jordan-sports/staging.env`; the sandbox cannot reach Pexels/Unsplash).
  Used for sport tiles, the home hero, and as a venue's cover when it has no uploads (labelled
  "صورة توضيحية"). Uploaded venue photos always win. Public credits page `/[locale]/credits`
  (footer link) and `GET /v1/stock/credits`.

### Home
- Hero: stock photo with slow parallax when available, else the illustrated pitch split into three
  parallax layers (sky/hills/pitch). Live counters from `catalog.counts` ("10 ملاعب · 17 رياضة",
  ICU plurals, CSS count-up) with a live dot.
- Search card: focus ring glow, button icon spring.
- Sport tiles: photo tiles when the sport has stock photos, icon tiles otherwise; staggered reveal.
- Featured venues: swipeable scroll-snap carousel (arrows on ≥ sm, RTL-aware), numbered photo cards.

### Venue page
- Gallery: swipe on phones, arrows + "All photos" lightbox (`<dialog>`, Esc/arrow keys) on ≥ md;
  stock cover with the illustrative label when there are no uploads.
- Sticky mini header (name, from-price, Book) slides in once the hero scrolls away.
- Amenity icons by catalog key (unknown keys fall back to a check).
- Map preview card (drawn SVG + pin); MapLibre (~270 KB) loads only when tapped.

### Booking flow
- Tapping a time **selects** it (pop animation); a booking bar shows time, price, day, length (and
  court) with Book — a bottom sheet over the tab bar on phones, sticky in the card on desktop.
  Book holds the slot (signed-out players go to sign-in and come back with day/time highlighted).
- Slot loading is a skeleton grid; hold errors are toasts.
- Booking page: skeleton while loading, countdown ring (clay, red in the last minute), success
  banner with a self-drawing check + confetti-lite, animated status badge, toasts for
  release/cancel/errors.

## Performance (Lighthouse mobile, local prod build, design DB)

| Page | Before | After |
| --- | --- | --- |
| Home `/ar` | 65 (LCP 5.7 s, TBT 270 ms) | 88–90 (LCP 3.2 s, TBT 200 ms, CLS 0.005) |
| Venue `/ar/venues/demo-padel-club` | 71 (JS 555 KB, TBT 570 ms) | ~80 (JS 285–295 KB, CLS 0.01) |

Lessons recorded here so they are not repeated:
- A route-level `loading.tsx` on a server-rendered page streams a skeleton and swaps it out:
  CLS ≈ 1 and a later LCP. Skeletons are only for client-fetched data.
- A page-wrapper transition that keeps a `transform` makes that wrapper the containing block of
  every `position: fixed` bar inside it. The route transition was removed; heroes keep `animate-rise`.

## Deliberately deferred (after the user's review)
- Rest of the app: owner dashboard (KPI count-ups, calendar interactions, drag-to-create), toasts
  on every save/delete in manage/admin, pull-to-refresh on My bookings, bottom tab bar labels
  (الرئيسية، استكشف، حجوزاتي، حسابي), empty-state illustrations, skeletons on the remaining screens.
- Venue page LCP (~4 s simulated) is bound by hydration JS; next step is trimming client JS on
  that page.

## Open decisions
- Whether to keep the numbered ("01", "02") style on carousel cards.
- The stock photo set needs the user's eye once downloaded on staging (exclude list in
  `infra/stock-photos/sports.json`).
