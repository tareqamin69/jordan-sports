# P9 — Design leap (master plan phase 3)

- **Spec:** [`/DESIGN.md`](../../DESIGN.md) ("Clubhouse": deep green + warm sand, Alexandria display +
  IBM Plex body, one radius family).
- **Status:** 3a approved by the owner 2026-10-02; 3b and 3c shipped to staging 2026-10-03. 3d–3e next.

## 3a — Direction (shipped)

- Tokens: sand scale (`sand-50…300`, `sand-700` text), warmer canvas/surface, green-tinted shadows,
  radii 14/18/24/32. Alexandria 700/800 replaces Amiri (self-hosted).
- Home: pitch-markings hero (`pitch-lines.tsx`), sand sport tiles (swipe row on phones), picks
  without "01/02" numbering, sand owner block.
- Venue: quick facts (courts, book-ahead window, card payment); courts list without numbering.
- Checkout: total-before-paying summary (`checkout-summary`).

## 3b — Every screen (shipped)

Most of 3b is carried by the shared tokens and `@jordan-sports/ui`, so player, owner and admin
screens all switched together. On top of that:
- Display line heights loosened everywhere for Alexandria's Arabic (≥ 1.3).
- Sign-in header uses the pitch lines; the old dusk illustration (`HeroArt`) and its parallax CSS
  are removed.
- Em dashes removed from all user-facing copy and UI joiners (`·` or punctuation instead);
  ESLint's allowed JSX literals gain `-`.
- Screens reviewed at 390px (player, owner) and 1440px (owner, admin).

## 3c — Next-level features (shipped)

- Search: "free tonight" chip (today from 20:00 or the next hour; after midnight the coming
  evening) with lime badges; sort (recommended / cheapest / nearest); list/map switch with a lazily
  loaded results map; sticky chips. Fixed: the search form and results kept stale state (and the
  form was duplicated) after a chip navigated client-side; both now key themselves internally.
- Venue: public `cancellation` (free hours + late refund %) shown as a badge; free times carry a
  price-heat bar (cheapest to peak) with a legend; generated share card `/og/venue/<slug>.png` for
  photo-less venues (Latin text only).
- Owner: "today" command centre (counts, playing now, next booking); weekly net earnings column
  chart (8 weeks, open week lighter, table view).
- PWA: icons regenerated in Alexandria (`tests/e2e/tools/generate-icons.mjs`), manifest/offline
  colours, service-worker cache v2. Admin list rows tightened.
- Not done (judged low value now): per-day price heat in the day strip (needs 7 availability
  calls), a separate bottom sheet (the booking bar already is one on phones).

## Deferred to 3d–3e

- Motion pass (3d), quality gates (3e: axe/Lighthouse, break-ui, 390/1440 screenshots).
