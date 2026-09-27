import { defaultLocale, locales } from '@jordan-sports/i18n';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  // Approved decision: Arabic is the default; no automatic Accept-Language redirect.
  localeDetection: false,
});
