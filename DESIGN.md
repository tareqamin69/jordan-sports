# Jorena design system: "Clubhouse"

The visual language for every Jorena surface (player web, venue-owner dashboard, admin). It is
Arabic-first, built for phones, and should feel like **the club's front desk**: calm and
trustworthy, with a little matchday energy. Tokens live in `packages/ui/src/tokens.css`. Apps never
use raw hex values.

**Design read:** a two-sided sports-booking marketplace for Jordanian players (mostly on phones)
and venue owners, in a warm "Clubhouse" register. It's a product rather than a landing page, so
clarity wins over spectacle.
**Dials:** variance 6, motion 5, density 4 (player screens). Owner and admin screens run at
density 6–7.

---

## 1. Brand

- **Personality:** a good local club. You're welcome, things are on time, and the pitch is ready.
  It's confident but never loud.
- **Voice:** simple Jordanian Arabic, the way you'd text a friend who runs the club. Short
  sentences, real verbs ("احجز", "دوّر", "ادفع"), no marketing filler.
- **Name:** always from `packages/brand` (جورينا / Jorena).

## 2. Colour

Deep club green is the brand. Warm sand is the second colour. Lime appears only as "the ball" and
for live states.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Page | `canvas` | `#F6F1E7` | Page background (warm ivory) |
| Recessed | `canvas-deep` | `#EBE4D5` | Skeletons, map placeholders |
| Surface | `surface` | `#FFFDF9` | Cards and sheets (never pure white) |
| Sand fill | `sand-100` / `200` / `300` | `#F3EAD8` / `#E9DBBD` / `#DCC79C` | Tiles, quick facts, summaries, owner block |
| Sand text | `sand-700` | `#7A5D2A` | Labels on sand (AA on sand-100) |
| Brand | `primary` (`brand-700`) | `#0F4D34` | Primary buttons, selected states, prices |
| Brand deep | `brand-900` | `#072A1C` | Hero fields, dark panels |
| Ink | `ink` | `#151712` | Text |
| Ink muted | `ink-muted` | `#6A6E64` | Secondary text (4.6:1 on canvas) |
| Lines | `line` / `line-strong` | `#E7E0D1` / `#D6CDB9` | Hairlines, outlined chips |
| Ball | `lime` | `#E7F06A` | Headline highlight, live dots, the ball. **On dark only.** |
| Clay | `clay` | `#B4481F` | Tiny labels and warnings, never fills |
| Status | `danger` / `warning` / `success` | | Alerts only |

**Rules**
- One accent per screen. Green does the work; sand groups things; lime is a spark, never more
  than one element per view.
- No gradients on text or buttons, no glows, no purple. The only gradients are scrims over photos
  and the soft vignette in the hero.
- Shadows are tinted green-black (`rgb(7 42 28 / x)`), never pure black.
- Light theme today. Dark mode will remap the semantic tokens; components must not hard-code
  colours, so they inherit it for free.

## 3. Typography

| Role | Arabic | Latin | Notes |
| --- | --- | --- | --- |
| Display (h1–h3, prices in summaries) | **Alexandria** 700/800 | Alexandria 700/800 | Geometric Kufi-inspired sans with a matching Latin, so headings look identical in both languages |
| Body and UI | **IBM Plex Sans Arabic** 400/500/600 | **IBM Plex Sans** 400/500/600 | Already tuned for long Arabic reading |
| Numbers | Western digits (`numberingSystem: latn`), `tabular-nums` in lists and times | | Prices, times and references stay LTR inside RTL (`<Ltr>`) |

All fonts are self-hosted (`@fontsource`). There are no font CDNs.

**Scale (mobile → desktop)**

| Token | Size / line height | Use |
| --- | --- | --- |
| Display XL | 42 → 68px / 1.3 → 1.25 | Home hero only |
| Display L | 36 → 52px / 1.35 → 1.3 | Venue name over its hero |
| H1 | 32 → 40px / 1.3 | Page titles |
| H2 | 26px / 1.35 | Section titles (`SectionHeading`) |
| H3 | 18px / 1.4, Plex 700 | Card titles |
| Body | 16px / 1.8 (Arabic), 1.6 (Latin) | Paragraphs |
| Small | 14px | Meta, helper text |
| Micro | 12px | Field labels, fact labels |

**Rules**
- Arabic needs room: Alexandria display lines never go below **1.25** line height (the dots under
  ي/ب collide otherwise). Add `pb-1` under display lines that sit on another line.
- Never letter-space Arabic (it breaks joining). Latin display gets `-0.02em`.
- Emphasis is weight or the lime colour within the same family, never a second typeface.

## 4. Space, layout, grid

- 4px base, 8px rhythm. Page gutters are 20px on mobile and 32px from `sm`. Content max width is
  `max-w-6xl` (1152px).
- Mobile is a single column. On desktop, the venue page is content + a 22rem sticky aside.
- Sections are 56px apart on mobile and 64–80px on desktop. Cards have 20–28px padding.
- Logical properties only (`ms-`, `pe-`, `start-`). `scripts/check-rtl.mjs` enforces this.

## 5. Shape

One radius family. Interactive elements are pills; containers are soft.

| Token | Radius | Use |
| --- | --- | --- |
| `rounded-full` | pill | Buttons, chips, segmented controls, badges |
| `rounded-field` | 14px | Inputs and selects |
| `rounded-tile` | 18px | Tiles, quick facts, thumbnails, inner panels |
| `rounded-card` | 24px | Cards, sheets, the search card |
| `rounded-hero` | 32px | Bottom corners of full-bleed heroes |

## 6. Elevation

Flat by default: cards separate with a hairline or a sand fill, not a shadow.

| Level | Token | Use |
| --- | --- | --- |
| 0 | none | Cards, tiles, lists |
| 1 | `shadow-lift` | Hover on interactive cards only |
| 2 | `shadow-float` | Things that float over content: search card, bottom nav, sticky pay bar, sheets, toasts |

## 7. Motion

Motion explains what changed; it never decorates.

- **Durations:** 120ms (press), 200ms (hover and colour), 300–500ms (enter).
- **Easing:** `ease-soft` = `cubic-bezier(0.22, 1, 0.36, 1)` for enters; springs for small
  confirmations (selected chip "pop").
- **Patterns:** transform-only rise on page enter; scroll reveal for sections (once); press scale
  0.96–0.98; a hold-countdown ring; the booking-confirmed moment.
- **Never:** scroll-jacking, parallax on text, infinite loops (except live dots), layout-property
  animation.
- Everything collapses under `prefers-reduced-motion`.

## 8. Iconography

- One family: the in-house 24px line set in `apps/web/src/components/icons.tsx` plus sport glyphs
  in `packages/ui` (1.5–1.6 stroke, round caps). Icons are always paired with a label, except
  well-known controls (close, back, arrows), which carry `aria-label`.
- Sport icons sit in a 44px surface circle on sand tiles.
- No emoji in UI.

## 9. Art direction

- **Real photos first.** Venue photos are the hero of the venue page and the cards. There are no
  stock "people playing" shots pretending to be the venue.
- **Until a venue has photos:** the illustrated court (`court-art.tsx`), chosen by the sport icon.
  It's honest and recognisable, and never presented as a photo.
- **Home hero:** the pitch, drawn as thin ivory markings on deep green with the lime ball. It's
  pure geometry, works for every sport, and has no fake product screenshot.
- Photos get a dark scrim only where text sits on them, and are never filtered or tinted.
- Maps stay neutral and load on click (privacy and speed).

## 10. Components (in `@jordan-sports/ui`)

`Button` (primary / secondary / ghost / danger / inverse / night; sm / md / lg), `chipClass`,
`tileClass` (sand fill, or green when selected), `Card`, `Alert`, `Badge`, `SectionHeading`,
`PageHeader`, fields (label above, helper below, error below), skeletons, toasts, `EmptyState`.

## 11. Do / Don't

**Do**
- Put the price, the time and the rules *before* the pay button, with the total in display type.
- Show only real numbers (venue counts, courts, booking window). If there's no data, hide the
  element.
- Use sand to group related facts (quick facts, checkout summary, owner pitch).
- Keep one primary action per screen and give it the green.
- Test every screen at 390px RTL first, then 1440px, then English.

**Don't (AI clichés we avoid)**
- Numbered "01 / 02 / 03" labels on cards, section-number eyebrows, version stamps.
- Three identical feature cards, gradient blobs, glassmorphism, purple glows, neon.
- A small uppercase "eyebrow" over every section (max one per three sections; the hero gets one).
- Fake reviews, star ratings without data, "trusted by" walls, fake counters.
- Em dashes in copy, cute wordplay, filler verbs ("seamless", "elevate").
- Serif headlines (the old Amiri) for UI. Serif belongs to certificates, not booking apps.
- Shadows on resting cards, pure black or pure white.

## 12. Accessibility

WCAG 2.1 AA: text contrast ≥ 4.5:1 (sand-700 on sand-100 included), visible focus rings (ink, 2px),
44px minimum targets, labels on every field, `lang`/`dir` on the document and LTR islands for
numbers. axe runs in e2e on key pages.
