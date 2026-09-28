# Design system — "Clubhouse" (direction B)

Adopted 2026-09-27 for every screen (player web, venue-owner dashboard, admin). Source of truth is
`packages/ui` — apps must use its tokens and components, never raw hex values.

## Brand name

**Jorena** (English) / **جورينا** (Arabic), decided 2026-09-27. Defined once, in
`packages/brand` (`BRAND_NAME`, `BRAND_NAME_LATIN`) — never hardcode the name in a component,
message string, template or doc. Every surface reads from it, directly or via
`common.appName`/`admin.metadata.title` in `packages/i18n`: the header wordmark, page and browser
tab titles, SMS/notification templates, the WhatsApp share text, the OpenAPI title, the admin
TOTP issuer, the calendar-file (`.ics`) PRODID, and the PWA manifest. To rename the product again,
change `packages/brand/src/index.ts` and rebuild.

## Tokens (`packages/ui/src/tokens.css`, Tailwind v4 `@theme`)

| Token | Value | Use |
|---|---|---|
| `canvas` | `#F4F0E6` | Page background (warm ivory) |
| `canvas-deep` | `#E9E4D8` | Recessed fills, map placeholders |
| `surface` | `#FFFFFF` | Cards |
| `ink` / `night` | `#151712` | Text / dark floating surfaces (bottom nav, selected chips) |
| `ink-muted` | `#6A6E64` | Secondary text (4.6:1 on canvas, AA) |
| `ink-soft` | `#A9A596` | Icons/text on `night` only |
| `line` / `line-strong` | `#E6E1D6` / `#D8D2C4` | Hairlines / outlined chips |
| `primary` (= `brand-700`) | `#0F4D34` | Primary actions, selected tiles; hover `primary-hover` |
| `clay` (= `accent-500`) | `#B4481F` | **Small labels only** (`.eyebrow`, numbered picks) |

The `brand-*` and `accent-*` scales were re-tuned to the green/clay family so older utility
classes keep working.

- **Type:** `font-display` = Amiri Bold (headlines, section titles, big numbers); body/UI =
  IBM Plex Sans Arabic (Arabic) / IBM Plex Sans (English). All self-hosted via `@fontsource`.
  Never add letter-spacing to Arabic (breaks joining) — `.eyebrow` only tracks under `:lang(en)`.
- **Radius:** `rounded-card` 28px, `rounded-tile` 22px, `rounded-field` 16px (inputs),
  `rounded-hero` 36px (hero bottom corners), pills `rounded-full`.
- **Elevation:** `shadow-float` only on floating things (hero search card, bottom nav, sticky
  checkout bar, sheets). Cards are flat with a `line` border; `shadow-lift` on hover only.
- **Spacing:** 8px grid; page gutters 20px mobile (`px-5`), 32px from `sm`.
- **Motion:** `animate-rise` (transform-only, so axe never sees half-faded text) and 200–300ms
  colour/transform transitions; all motion is disabled under `prefers-reduced-motion`.

## Components (`@jordan-sports/ui`)

`Button` / `buttonClass()` (pill; variants primary, secondary, ghost, ghostDanger, danger,
inverse, night; sizes sm/md/lg), `chipClass(selected, {tone})`, `tileClass(selected)`, `Card`,
`Alert`, `Badge`, `Eyebrow`, `PageHeader` (serif h1 + optional eyebrow), `SectionHeading`,
form fields (`TextField`, `SelectField` with custom chevron, `CheckboxField`, `fieldControlClass`).

## App patterns (apps/web)

- **Header:** Amiri wordmark. On `/` and `/venues/[slug]` it floats over the full-bleed photo in
  ivory (`site-header.tsx` `overlayPaths`); elsewhere it is sticky on canvas.
- **Main nav (`main-nav.tsx`):** rendered once. Mobile = dark floating pill at the bottom (active
  item shows its label); `md+` = links in the header. Hidden on mobile when a page renders a
  `data-sticky-cta` element (checkout), see `apps/web/src/app/globals.css`.
- **Photos first:** `VenuePhoto` shows the cover or, until real photos exist, an illustrated
  court from `court-art.tsx` chosen by the sport's icon key (no sport names in code).
- Home: hero art + floating search card, 3-column sport tiles, editorial picks (01, 02…),
  governorate chips, green owner block (links to `/manage` until P3 self-registration exists).
