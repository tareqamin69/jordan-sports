'use client';

import { adminSignOut, type PlatformPermission } from '@jordan-sports/contracts/web';
import { Alert, Button, DetailSkeleton, cx } from '@jordan-sports/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAdminMe } from '@/lib/admin-session';
import { useApi } from '@/lib/api';
import { useActiveInView } from '@/lib/use-active-in-view';
import { useErrorMessage } from '@/lib/use-error-message';
import { ReauthDialog } from './reauth-dialog';

/** Each role sees only the sections it can use (the API enforces the same permissions). */
const sections: ReadonlyArray<{
  href: string;
  key: string;
  permission: PlatformPermission | null;
}> = [
  { href: '/', key: 'dashboard', permission: null },
  { href: '/venues', key: 'venues', permission: 'venues.read' },
  { href: '/organizations', key: 'organizations', permission: 'organizations.read' },
  { href: '/users', key: 'users', permission: 'users.read' },
  { href: '/bookings', key: 'bookings', permission: 'bookings.read' },
  { href: '/payouts', key: 'payouts', permission: 'revenue.read' },
  { href: '/payments', key: 'payments', permission: 'revenue.read' },
  { href: '/complaints', key: 'complaints', permission: 'complaints.read' },
  { href: '/geography', key: 'geography', permission: 'catalog.manage' },
  { href: '/holidays', key: 'holidays', permission: 'catalog.manage' },
  { href: '/settings', key: 'settings', permission: 'settings.read' },
  { href: '/team', key: 'team', permission: 'team.read' },
  { href: '/audit', key: 'audit', permission: 'audit.read' },
];

/** Requires an admin session; otherwise sends the user to the staff sign-in page. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin.nav');
  const tc = useTranslations('common');
  const me = useAdminMe();
  const router = useRouter();
  const pathname = usePathname();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const navList = useActiveInView<HTMLUListElement>(`${pathname}:${Boolean(me.data)}`);

  useEffect(() => {
    if (me.data === null) router.replace('/sign-in');
  }, [me.data, router]);

  if (me.isError) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
        <Alert tone="error">{errorMessage(me.error)}</Alert>
      </main>
    );
  }
  if (me.isPending || me.data === null) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
        <DetailSkeleton label={tc('loading')} />
      </main>
    );
  }

  const permissions = me.data.permissions;
  const signOut = async () => {
    await api(adminSignOut).catch(() => undefined);
    queryClient.clear();
    router.replace('/sign-in');
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-8 sm:px-8 md:flex-row">
      <nav aria-label={t('label')} className="md:w-56 md:shrink-0">
        <ul
          ref={navList}
          className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-5 md:sticky md:top-24 md:mx-0 md:flex-col md:px-0"
        >
          {sections
            .filter((s) => s.permission === null || permissions.includes(s.permission))
            .map((s) => {
              const active = s.href === '/' ? pathname === '/' : pathname.startsWith(s.href);
              return (
                <li key={s.key}>
                  <Link
                    href={s.href}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors duration-200',
                      active ? 'bg-night text-canvas' : 'text-ink hover:bg-canvas-deep',
                    )}
                  >
                    {t(s.key as Parameters<typeof t>[0])}
                  </Link>
                </li>
              );
            })}
          <li className="md:mt-4">
            <Button variant="ghost" size="sm" onClick={signOut} data-testid="admin-sign-out">
              {tc('actions.signOut')}
            </Button>
          </li>
        </ul>
      </nav>
      <main className="min-w-0 flex-1">{children}</main>
      <ReauthDialog />
    </div>
  );
}
