import type { Locale, MessageCatalog } from '@jordan-sports/i18n';

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: MessageCatalog;
  }
}
