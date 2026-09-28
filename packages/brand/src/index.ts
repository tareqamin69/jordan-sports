/**
 * The product's brand name — the one place it is defined. Every surface (web, admin, PWA
 * manifest, emails/SMS, OpenAPI docs, the admin TOTP issuer) reads from here, so renaming the
 * product later is a one-line change plus a rebuild, never a find-and-replace.
 */
export const BRAND_NAME = {
  ar: 'جورينا',
  en: 'Jorena',
} as const;

/** ASCII-only, for places that cannot render Arabic or need a single identifier (OpenAPI title, TOTP issuer, calendar-file PRODID, PWA short name). */
export const BRAND_NAME_LATIN = BRAND_NAME.en;
