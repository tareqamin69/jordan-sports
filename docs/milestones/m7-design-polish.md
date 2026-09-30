# M7 — Design polish ("alive" pass)

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
- **Photos come only from venues:** the owner uploads them (registration wizard / venue
  settings) or an admin does (admin venue editor). Without photos a venue shows the illustrated
  court for its sport. (A Pexels stock-photo fallback was built in phase 1 and then removed at
  the user's request — there is no stock imagery, credits page or `PEXELS_API_KEY`.)

### Home
- Hero: the illustrated pitch split into three parallax layers (sky/hills/pitch). Live counters from `catalog.counts` ("10 ملاعب · 17 رياضة",
  ICU plurals, CSS count-up) with a live dot.
- Search card: focus ring glow, button icon spring.
- Sport tiles: icon tiles (`SportTile`, shared with `/sports`); staggered reveal.
- Featured venues: swipeable scroll-snap carousel (arrows on ≥ sm, RTL-aware), numbered photo cards.

### Venue page
- Gallery: swipe on phones, arrows + "All photos" lightbox (`<dialog>`, Esc/arrow keys) on ≥ md;
  illustrated court when the venue has no photos.
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

## Phase 2 (after the user approved phase 1): the rest of the site + stabilization

- Stock photos dropped entirely (module, CLI, deploy step, credits page, contract fields); see
  Images above.
- `/sports` subtitle no longer claims every sport has an approved venue.
- **Shared building blocks** (`packages/ui`): skeleton presets (`ListSkeleton`, `StatsSkeleton`,
  `FormSkeleton`, `DetailSkeleton`, `GridSkeleton`), `EmptyState` with on-brand illustrations
  (venues / bookings / search / inbox), `CountUp` (CSS), `notify()` for toasts from outside React.
- **Toasts everywhere:** both apps' query clients have a `MutationCache` that shows
  `meta.toast` on success; every save/add/remove/confirm mutation declares one (common texts in
  `common.toast`). Inline "saved" alerts were replaced; errors stay inline next to the form.
  Info that must stay on screen stays inline (e.g. "back to review", skipped repeat dates, the
  staff invite link).
- **No spinners left:** every loading state is a skeleton shaped like its screen (web + admin).
- Player: venues list (reveal, empty states), `/sports` tiles, My bookings (skeleton, empty
  state, pull-to-refresh on touch), account (lift rows), support (toasts), sign-in (6-box code
  input over a single real input, step dots, step transitions), tab bar press feedback.
- Owner: dashboard skeleton, tab content eases in, active tab scrolled into view on phones,
  KPI count-ups in reports, quick-booking sheet slides up, registration wizard progress bar with
  checked steps, step transitions, scroll-to-top per step, and a success screen.
- Admin: toasts, skeletons, dashboard count-ups, empty states, active menu item kept in view.

### Stabilization pass
Automated walkthrough of every page (guest, player incl. book + confirm, owner on all tabs,
admin on all sections) at 375 px and 1366 px on the demo data, checking JS errors, 5xx,
horizontal overflow, broken images, error alerts and touch targets. Fixed:
- Hydration mismatch (React #418) on venue pages: the header hydrates late (Suspense) and the
  account label could already know the user → `useHydrated()` keeps the server label until then.
- "We sent a code to ." — the phone was never shown on the OTP screen (rich-text misuse); now
  covered by e2e.
- Toast items were `<button role=status>` (axe: button-name) → plain live-region items.
- Admin geography rows overflowed at 375 px → wrap.
- Touch targets: header brand, "all sports" link, gallery dots, admin dashboard links.
Accepted as is: card title links (the whole card is the target), inline e-mail link, the owner
calendar's 30-minute grid cells (28 px, a dense time grid).

## Deliberately deferred
- Calendar drag-to-create.
- Venue page LCP (~4 s simulated) is bound by hydration JS; next step is trimming client JS there.

## Open decisions
- Whether to keep the numbered ("01", "02") style on carousel cards.
