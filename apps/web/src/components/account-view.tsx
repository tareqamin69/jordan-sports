'use client';

import { signOut } from '@jordan-sports/contracts';
import { Alert, Button, Card, Ltr, PageHeader, Spinner, buttonClass } from '@jordan-sports/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useMe } from '@/lib/session';
import { useErrorMessage } from '@/lib/use-error-message';
import { Icon } from './icons';

export function AccountView() {
  const t = useTranslations('web.account');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const me = useMe();
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = useState(false);
  const signingOut = useRef(false);

  useEffect(() => {
    if (me.data === null && !signingOut.current) router.replace('/sign-in');
  }, [me.data, router]);

  if (me.isPending || me.data === null) return <Spinner label={tc('loading')} />;
  if (me.isError) return <Alert tone="error">{errorMessage(me.error)}</Alert>;

  const user = me.data;
  const onSignOut = async () => {
    signingOut.current = true;
    setBusy(true);
    try {
      await api(signOut);
    } finally {
      queryClient.setQueryData(['me'], null);
      setBusy(false);
      router.replace('/');
    }
  };

  return (
    <div className="flex animate-rise flex-col gap-4">
      <PageHeader
        title={t('title')}
        actions={
          <Button variant="secondary" onClick={onSignOut} busy={busy}>
            {tc('actions.signOut')}
          </Button>
        }
      />
      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-ink-muted">{t('name')}</dt>
            <dd className="mt-1 font-medium" data-testid="account-name">
              {user.displayName}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">{t('phone')}</dt>
            <dd className="mt-1 font-medium">{user.phone ? <Ltr>{user.phone}</Ltr> : null}</dd>
          </div>
        </dl>
      </Card>
      <Link
        href="/bookings"
        className="group flex min-h-16 items-center justify-between gap-3 rounded-card border border-line bg-surface px-6 py-4 font-semibold transition-colors hover:border-line-strong"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-primary">
            <Icon name="calendar" className="size-5" />
          </span>
          {t('bookingsLink')}
        </span>
        <Icon name="chevron" className="size-5 text-ink-muted rtl:rotate-180" />
      </Link>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">{t('organizationsTitle')}</h2>
          {user.memberships.length > 0 ? (
            <Link href="/manage" className={buttonClass({ size: 'sm' })} data-testid="manage-link">
              {t('manageLink')}
            </Link>
          ) : null}
        </div>
        {user.memberships.length === 0 ? (
          <p className="mt-2 text-ink-muted">{t('organizationsEmpty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {user.memberships.map((m) => (
              <li key={m.organizationId} className="flex items-center justify-between gap-3 py-3">
                <span className="font-medium">
                  {m.organizationName[locale] ?? m.organizationName.ar ?? m.organizationName.en}
                </span>
                <span className="text-sm text-ink-muted">{tc(`roles.${m.role}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
