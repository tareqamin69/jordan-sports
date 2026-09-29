'use client';

import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Icon } from './icons';
import { LocaleSwitcher } from './locale-switcher';
import { MainNav } from './main-nav';
import { VenueNav } from './venue-nav';

/** Header-level "player ⇄ venue owner" toggle (plan §2). Presentation only: it just navigates. */
function ModeSwitch({ inVenueMode, overlay }: { inVenueMode: boolean; overlay: boolean }) {
  const t = useTranslations('web.header');
  return (
    <Link
      href={inVenueMode ? '/' : '/manage'}
      aria-label={inVenueMode ? t('switchToPlayer') : t('switchToVenue')}
      className={cx(
        'flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors duration-200',
        overlay
          ? 'border-canvas/35 bg-night/60 text-canvas backdrop-blur-sm hover:bg-night/75'
          : 'border-line-strong text-ink hover:bg-surface',
      )}
    >
      <Icon name="swap" className="size-4" />
      <span className="hidden sm:inline">
        {inVenueMode ? t('switchToPlayer') : t('switchToVenue')}
      </span>
    </Link>
  );
}

/** Pages that open with a full-bleed photo: the header floats over it in ivory. */
const overlayPaths = [/^\/$/, /^\/venues\/[^/]+$/];
/** The venue interface (plan §2) gets its own shell and navigation, not the player's. */
const venueMode = /^\/manage(\/|$)/;

export function SiteHeader() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const overlay = overlayPaths.some((re) => re.test(pathname));
  const inVenueMode = venueMode.test(pathname);
  return (
    <header
      className={cx(
        'z-30',
        overlay
          ? 'absolute inset-x-0 top-0 text-canvas'
          : // The frosted background lives on a ::before layer, not the header itself: a
            // backdrop-filter on the header would make it the containing block for MainNav's
            // `fixed` bottom pill on mobile (it would render pinned to the header, not the
            // viewport). See https://www.w3.org/TR/filter-effects-1/#FilterProperty.
            'sticky top-0 text-ink before:absolute before:inset-0 before:-z-10 before:border-b before:border-line before:bg-canvas/90 before:backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex h-18 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link
          href="/"
          className={cx(
            'flex min-h-11 items-center font-display text-[1.75rem] leading-none whitespace-nowrap sm:text-[2rem]',
            overlay ? 'text-canvas [text-shadow:0_1px_8px_rgb(0_0_0_/_0.45)]' : 'text-primary',
          )}
          data-testid="brand"
        >
          {t('appName')}
        </Link>
        {inVenueMode ? <VenueNav /> : <MainNav overlay={overlay} />}
        <div className="ms-auto flex items-center gap-2">
          <ModeSwitch inVenueMode={inVenueMode} overlay={overlay} />
          <LocaleSwitcher overlay={overlay} />
        </div>
      </div>
    </header>
  );
}
