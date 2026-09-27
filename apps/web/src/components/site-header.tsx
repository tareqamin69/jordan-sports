'use client';

import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LocaleSwitcher } from './locale-switcher';
import { MainNav } from './main-nav';

/** Pages that open with a full-bleed photo: the header floats over it in ivory. */
const overlayPaths = [/^\/$/, /^\/venues\/[^/]+$/];

export function SiteHeader() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const overlay = overlayPaths.some((re) => re.test(pathname));
  return (
    <header
      className={cx(
        'z-30',
        overlay
          ? 'absolute inset-x-0 top-0 text-canvas'
          : 'sticky top-0 border-b border-line bg-canvas/90 text-ink backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex h-18 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className={cx(
            'font-display text-[1.75rem] leading-none whitespace-nowrap sm:text-[2rem]',
            overlay ? 'text-canvas' : 'text-primary',
          )}
          data-testid="brand"
        >
          {t('appName')}
        </Link>
        <MainNav overlay={overlay} />
        <div className="ms-auto flex items-center gap-2">
          <LocaleSwitcher overlay={overlay} />
        </div>
      </div>
    </header>
  );
}
