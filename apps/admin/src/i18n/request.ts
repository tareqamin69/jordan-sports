import { intlFormats, messages } from '@jordan-sports/i18n';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: messages[locale],
    formats: intlFormats,
    // Default display zone for the initial market. Venue-specific times always use the
    // venue's own IANA zone (docs/architecture.md §H).
    timeZone: 'Asia/Amman',
  };
});
