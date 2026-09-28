'use client';

import { getDirection, locales } from '@jordan-sports/i18n';
import { cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * Links to the current page in the other language, preserving the path. Wrapped in its own `nav`
 * landmark only when `landmark` is left on — a page (like the footer) that already has one
 * elsewhere (the header) sets it to `false` so the two aren't indistinguishable duplicates.
 */
export function LocaleSwitcher({
  overlay = false,
  landmark = true,
  testId = 'locale-switcher',
}: {
  overlay?: boolean;
  landmark?: boolean;
  testId?: string;
}) {
  const t = useTranslations('common.languageSwitcher');
  const locale = useLocale();
  const pathname = usePathname();
  const target = locales.find((l) => l !== locale) ?? locale;

  const link = (
    <Link
      href={pathname}
      locale={target}
      lang={target}
      hrefLang={target}
      dir={getDirection(target)}
      className={cx(
        'flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-200',
        overlay
          ? 'border-canvas/35 bg-night/60 text-canvas backdrop-blur-sm hover:bg-night/75 focus-visible:outline-canvas'
          : 'border-line-strong text-ink hover:bg-surface',
      )}
      data-testid={testId}
    >
      {t('switchTo')}
    </Link>
  );

  return landmark ? <nav aria-label={t('label')}>{link}</nav> : link;
}
