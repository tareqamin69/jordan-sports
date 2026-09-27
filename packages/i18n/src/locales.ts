/**
 * Supported UI locales. Arabic is the default (approved product decision, see
 * docs/architecture.md §A.2). Adding a language means adding it here and adding a
 * catalog under ./messages.
 */
export const locales = ['ar', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar';

export type TextDirection = 'rtl' | 'ltr';

const directions: Record<Locale, TextDirection> = {
  ar: 'rtl',
  en: 'ltr',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): TextDirection {
  return directions[locale];
}

/**
 * BCP 47 tag to pass to `Intl.*` formatters. Western digits (0-9) are used in every
 * locale (approved product decision), so the numbering system is always explicit:
 * CLDR defaults for some Arabic locales would otherwise render Eastern Arabic digits.
 */
export function toIntlLocale(locale: Locale): string {
  return `${locale}-u-nu-latn`;
}
