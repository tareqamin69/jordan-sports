'use client';

import { getDirection, locales } from '@jordan-sports/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/** Links to the current page in the other language, preserving the path. */
export function LocaleSwitcher() {
  const t = useTranslations('common.languageSwitcher');
  const locale = useLocale();
  const pathname = usePathname();
  const target = locales.find((l) => l !== locale) ?? locale;

  return (
    <nav aria-label={t('label')}>
      <Link
        href={pathname}
        locale={target}
        lang={target}
        hrefLang={target}
        dir={getDirection(target)}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50"
        data-testid="locale-switcher"
      >
        {t('switchTo')}
      </Link>
    </nav>
  );
}
