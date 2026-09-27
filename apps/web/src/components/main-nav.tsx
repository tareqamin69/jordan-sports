'use client';

import { cx } from '@jordan-sports/ui';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useMe } from '@/lib/session';
import { Icon } from './icons';

/**
 * The one main navigation. Mobile: a dark floating pill at the bottom of the screen (the active
 * item shows its label). From `md`: plain links inside the header. Rendered once so each link
 * exists a single time in the DOM.
 */
export function MainNav({ overlay }: { overlay: boolean }) {
  const t = useTranslations('web.header');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const me = useMe();
  const signedOut = me.data === null;
  const accountLabel = me.data
    ? (me.data.displayName ?? t('account'))
    : signedOut
      ? t('signIn')
      : t('account');

  const items = [
    { key: 'home', href: '/', icon: 'home', label: t('home'), active: pathname === '/' },
    {
      key: 'explore',
      href: '/venues',
      icon: 'compass',
      label: t('explore'),
      active: pathname.startsWith('/venues'),
    },
    {
      key: 'sports',
      href: '/sports',
      icon: 'grid',
      label: tc('allSports'),
      active: pathname.startsWith('/sports'),
      desktopOnly: true,
    },
    {
      key: 'bookings',
      href: '/bookings',
      icon: 'calendar',
      label: t('bookings'),
      active: pathname.startsWith('/bookings'),
      testId: 'bookings-link',
    },
    {
      key: 'account',
      href: signedOut ? '/sign-in' : '/account',
      icon: 'user',
      label: accountLabel,
      active: ['/account', '/sign-in', '/manage'].some((p) => pathname.startsWith(p)),
      testId: 'account-link',
    },
  ];

  return (
    <nav
      aria-label={t('navLabel')}
      data-bottom-nav
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
          data-testid={item.testId}
          className={cx(
            'group flex min-w-0 justify-center rounded-full focus-visible:outline-canvas md:flex-none',
            item.active ? 'shrink-0' : 'flex-1',
            item.desktopOnly && 'hidden md:flex',
            !overlay && 'md:focus-visible:outline-focus',
          )}
        >
          <span
            className={cx(
              'flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 md:h-10 md:text-sm md:font-medium',
              item.active ? 'bg-canvas text-ink' : 'text-ink-soft group-hover:text-canvas',
              // Desktop colours depend on what the header sits on.
              overlay
                ? item.active
                  ? 'md:bg-canvas md:text-ink'
                  : 'md:text-canvas/85 md:group-hover:bg-canvas/15 md:group-hover:text-canvas'
                : item.active
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
