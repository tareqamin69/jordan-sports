'use client';

import { adminSignOut } from '@jordan-sports/contracts';
import { Alert, Button, Spinner, cx } from '@jordan-sports/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useAdminMe } from '@/lib/admin-session';
import { useApi } from '@/lib/api';
import { useErrorMessage } from '@/lib/use-error-message';

const sections = [
  { href: '/', key: 'dashboard' },
  { href: '/organizations', key: 'organizations' },
  { href: '/users', key: 'users' },
  { href: '/audit', key: 'audit' },
] as const;

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

  useEffect(() => {
    if (me.data === null) router.replace('/sign-in');
  }, [me.data, router]);

  if (me.isError) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Alert tone="error">{errorMessage(me.error)}</Alert>
      </main>
    );
  }
  if (me.isPending || me.data === null) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <Spinner label={tc('loading')} />
      </main>
    );
  }

  const signOut = async () => {
    await api(adminSignOut).catch(() => undefined);
    queryClient.clear();
    router.replace('/sign-in');
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
      <nav aria-label={t('label')} className="md:w-52 md:shrink-0">
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {sections.map((s) => {
            const active = s.href === '/' ? pathname === '/' : pathname.startsWith(s.href);
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium',
                    active ? 'bg-brand-50 text-brand-900' : 'text-ink hover:bg-canvas',
                  )}
                >
                  {t(s.key)}
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
    </div>
  );
}
