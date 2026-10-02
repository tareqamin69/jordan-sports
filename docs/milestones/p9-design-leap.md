# P9 — Design leap (master plan phase 3)

- **Spec:** [`/DESIGN.md`](../../DESIGN.md) ("Clubhouse": deep green + warm sand, Alexandria display +
  IBM Plex body, one radius family).
- **Status:** 3a approved by the owner 2026-10-02; 3b shipped to staging 2026-10-02. 3c–3e next.

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

## Deferred to 3c–3e

- Search list/map toggle, sticky filters, "free tonight" badges, availability heat strip, venue
  cancellation badge, payment success animation, OG images, sport identity, owner "today" command
  centre and payouts chart, dense admin tables, PWA polish.
- Motion pass (3d), quality gates (3e: axe/Lighthouse, break-ui, 390/1440 screenshots).
