# 0011. Locale-prefixed URLs and translated content in jsonb

- **Status:** Accepted
- **Date:** 2026-09-27
- **Related:** [architecture §M](../architecture.md#m-internationalization-arabic--english)

## Context

Arabic and English are first-class, with correct RTL/LTR behaviour, SEO for public pages in both
languages, and the ability to add languages later. Venue-provided content (names, descriptions,
addresses) must be translatable.

## Decision

- **URLs are locale-prefixed**: `/ar/…` and `/en/…` (next-intl, `localePrefix: "always"`).
  **Arabic is the default locale**; `/` redirects to `/ar`. There is no automatic Accept-Language
  redirect (approved decision); users switch language explicitly.
- `<html lang dir>` is set from the locale; `ar` → `rtl`, `en` → `ltr`.
- UI strings live in ICU MessageFormat catalogs in `packages/i18n`; catalogs must have identical keys
  (CI check); JSX text literals are forbidden by lint.
- Formatting uses `Intl` with an explicit numbering system: **Western digits** in both locales
  (`ar-u-nu-latn`).
- Translatable database content is stored as **`jsonb`** objects keyed by locale
  (`{"ar": "…", "en": "…"}`) with a CHECK that at least one supported locale is present, and a
  documented fallback order (requested → `ar` → `en`).
- Styling uses logical properties only; a repository check rejects physical left/right utilities.

## Consequences

- Each page has a stable, indexable URL per language with `hreflang` alternates.
- Adding a language means a new catalog, a locale config entry and (for content) a new jsonb key.
- `jsonb` translations are simple to read/write but cannot use per-language foreign keys or
  per-language NOT NULL columns; completeness is checked in application code and admin tooling.

## Alternatives considered

- **Cookie/header-based locale without URL prefix:** poor SEO and non-shareable localized links.
- **Separate columns per language (`name_ar`, `name_en`):** schema change for every new language.
- **Translation tables (entity, field, locale, value):** flexible but verbose joins for every read.
