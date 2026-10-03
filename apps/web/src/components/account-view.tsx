'use client';

import { deleteMyAccount, signOut, updateMe } from '@jordan-sports/contracts/web';
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  DetailSkeleton,
  Ltr,
  PageHeader,
  buttonClass,
} from '@jordan-sports/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { displayPhone } from '@/lib/format';
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

  if (me.isPending || me.data === null) return <DetailSkeleton label={tc('loading')} />;
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
    <div className="reveal-stagger flex animate-rise flex-col gap-4">
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
            <dd className="mt-1 font-medium">
              {user.phone ? <Ltr>{displayPhone(user.phone)}</Ltr> : null}
            </dd>
          </div>
        </dl>
      </Card>
      <Link
        href="/bookings"
        className="lift group flex min-h-16 items-center justify-between gap-3 rounded-card border border-line bg-surface px-6 py-4 font-semibold hover:border-line-strong"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-primary">
            <Icon name="calendar" className="size-5" />
          </span>
          {t('bookingsLink')}
        </span>
        <Icon
          name="chevron"
          className="size-5 text-ink-muted transition-transform duration-base ease-soft group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        />
      </Link>
      <Link
        href="/support"
        data-testid="support-link"
        className="lift group flex min-h-16 items-center justify-between gap-3 rounded-card border border-line bg-surface px-6 py-4 font-semibold hover:border-line-strong"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-primary">
            <Icon name="flag" className="size-5" />
          </span>
          {t('supportLink')}
        </span>
        <Icon
          name="chevron"
          className="size-5 text-ink-muted transition-transform duration-base ease-soft group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        />
      </Link>
      <Link
        href="/manage"
        data-testid="switch-mode-link"
        className="lift group flex min-h-16 items-center justify-between gap-3 rounded-card border border-line bg-surface px-6 py-4 hover:border-line-strong"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-primary">
            <Icon name="swap" className="size-5" />
          </span>
          <span className="flex flex-col">
            <span className="font-semibold">{t('switchToVenue')}</span>
            <span className="text-sm text-ink-muted">{t('switchToVenueHint')}</span>
          </span>
        </span>
        <Icon
          name="chevron"
          className="size-5 text-ink-muted transition-transform duration-base ease-soft group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        />
      </Link>
      {/* Venues the user runs (nothing to show for players: the switch above covers that). */}
      {user.memberships.length > 0 ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl">{t('organizationsTitle')}</h2>
            <Link href="/manage" className={buttonClass({ size: 'sm' })} data-testid="manage-link">
              {t('manageLink')}
            </Link>
          </div>
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
        </Card>
      ) : null}
      <PrivacyCard marketingOptIn={user.marketingOptIn} />
    </div>
  );
}

/** "خصوصيتك": the marketing preference and deleting the account (PDPL rights). */
function PrivacyCard({ marketingOptIn }: { marketingOptIn: boolean }) {
  const t = useTranslations('web.account.privacy');
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [confirming, setConfirming] = useState(false);
  // The box shows the player's choice at once; it goes back if saving fails.
  const [optIn, setOptIn] = useState(marketingOptIn);
  const marketing = useMutation({
    mutationFn: (optIn: boolean) => api(updateMe, { body: { marketingOptIn: optIn } }),
    meta: {
      toast: (data: unknown) =>
        (data as { marketingOptIn: boolean }).marketingOptIn ? t('on') : t('off'),
    },
    onSuccess: (me) => queryClient.setQueryData(['me'], me),
    onError: (_error, attempted) => setOptIn(!attempted),
  });
  const remove = useMutation({
    mutationFn: () => api(deleteMyAccount, { body: { confirm: true } }),
    meta: { toast: t('deleted') },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
      router.replace('/');
    },
  });

  return (
    <Card className="flex flex-col gap-4" data-testid="privacy-card">
      <div>
        <h2 className="font-display text-2xl">{t('title')}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t.rich('intro', {
            link: (chunks) => (
              <Link href="/privacy" className="font-medium text-primary hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
      <CheckboxField
        label={t('marketing')}
        checked={optIn}
        disabled={marketing.isPending}
        onChange={(e) => {
          setOptIn(e.target.checked);
          marketing.mutate(e.target.checked);
        }}
        name="marketingOptIn"
      />
      {marketing.isError ? <Alert tone="error">{errorMessage(marketing.error)}</Alert> : null}
      <div className="border-t border-line pt-4">
        {confirming ? (
          <div className="flex flex-col gap-3" role="alertdialog" aria-labelledby="delete-title">
            <p id="delete-title" className="font-semibold">
              {t('deleteQuestion')}
            </p>
            <p className="text-sm leading-relaxed text-ink-muted">{t('deleteExplain')}</p>
            {remove.isError ? <Alert tone="error">{errorMessage(remove.error)}</Alert> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                busy={remove.isPending}
                onClick={() => remove.mutate()}
                data-testid="confirm-delete-account"
              >
                {t('deleteConfirm')}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t('keep')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghostDanger"
            onClick={() => setConfirming(true)}
            data-testid="delete-account"
          >
            {t('delete')}
          </Button>
        )}
      </div>
    </Card>
  );
}
