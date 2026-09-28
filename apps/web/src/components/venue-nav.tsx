'use client';

import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname } from '@/i18n/navigation';
import { useManagedVenues } from '@/lib/manage';
import { Icon } from './icons';

const VENUE_ID = /^\/manage\/([0-9a-f-]{36})/;

/**
 * The venue interface's own navigation (plan §2: "/manage gets its own shell"). Same floating
 * pill language as the player MainNav, different destinations — today's calendar, bookings,
 * settings (hours/rules/pricing/closures, reached from there) — plus the switch back to player
 * mode. When the signed-in user manages exactly one venue, links go straight to it; otherwise
 * they land on the venue picker at /manage.
 */
export function VenueNav() {
  const t = useTranslations('web.manage.nav');
  const tc = useTranslations('web.header');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venues = useManagedVenues();

  const matched = VENUE_ID.exec(pathname)?.[1];
  const single = venues.data?.items.length === 1 ? venues.data.items[0]!.id : undefined;
  const venueId = matched ?? single;
  const base = venueId ? `/manage/${venueId}` : '/manage';
  const tab = matched ? (searchParams.get('tab') ?? 'calendar') : null;
  const currentVenue = venues.data?.items.find((v) => v.id === venueId);
  // Calendar/bookings/hours only make sense once the venue is public: before that, replace them
  // with a single "status" item pointing at the dashboard, which explains where things stand.
  const notApprovedYet = currentVenue !== undefined && currentVenue.status !== 'approved';

  const items = [
    ...(notApprovedYet
      ? ([
          {
            key: 'status',
            href: base,
            icon: 'clock',
            label: t('status'),
            active: matched !== undefined,
          },
        ] as const)
      : ([
          {
            key: 'today',
            href: base,
            icon: 'home',
            label: t('today'),
            active: matched !== undefined && tab === 'calendar',
          },
          {
            key: 'bookings',
            href: { pathname: base, query: { tab: 'bookings' } },
            icon: 'calendar',
            label: t('bookings'),
            active: tab === 'bookings',
          },
          {
            key: 'settings',
            href: { pathname: base, query: { tab: 'hours' } },
            icon: 'sliders',
            label: t('settings'),
            active: tab !== null && tab !== 'calendar' && tab !== 'bookings',
          },
        ] as const)),
    {
      key: 'account',
      href: '/account',
      icon: 'user',
      label: tc('account'),
      active: pathname.startsWith('/account'),
    },
  ] as const;

  return (
    <nav
      aria-label={t('label')}
      className={cx(
        'fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex h-16 items-center rounded-full bg-night px-2.5 shadow-float',
        'md:static md:flex md:h-auto md:gap-1 md:rounded-none md:bg-transparent md:px-0 md:shadow-none',
      )}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cx(
            'group flex min-w-0 flex-1 justify-center rounded-full focus-visible:outline-canvas md:flex-none md:focus-visible:outline-focus',
            item.active && 'shrink-0',
          )}
        >
          <span
            className={cx(
              'flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 md:h-10 md:text-sm md:font-medium',
              item.active ? 'bg-canvas text-ink' : 'text-ink-soft group-hover:text-canvas',
              item.active
                ? 'md:bg-night md:text-canvas'
                : 'md:text-ink md:group-hover:bg-canvas-deep md:group-hover:text-ink',
            )}
          >
            <Icon
              name={item.icon}
              className={cx('shrink-0 md:hidden', item.active ? 'size-[18px]' : 'size-[22px]')}
              strokeWidth={item.active ? 2 : 1.8}
            />
            <span
              className={cx(
                'max-w-[5.5rem] truncate md:max-w-[10rem]',
                !item.active && 'sr-only md:not-sr-only',
              )}
            >
              {item.label}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
