'use client';

import { getDirection, locales } from '@jordan-sports/i18n';
import { cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/** Links to the current page in the other language, preserving the path. */
export function LocaleSwitcher({ overlay = false }: { overlay?: boolean }) {
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
        className={cx(
          'flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-200',
          overlay
            ? 'border-canvas/35 bg-night/25 text-canvas backdrop-blur-sm hover:bg-night/40 focus-visible:outline-canvas'
            : 'border-line-strong text-ink hover:bg-surface',
        )}
        data-testid="locale-switcher"
      >
        {t('switchTo')}
      </Link>
    </nav>
  );
}
