'use client';

import { Alert, Badge, buttonClass, Card, PageHeader, Spinner } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError } from '@/lib/api';
import { useManagedVenues } from '@/lib/manage';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';
import { CourtArt } from '../court-art';
import { Icon } from '../icons';

export function ManageHome() {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const venues = useManagedVenues();

  useEffect(() => {
    if (isApiError(venues.error, 'UNAUTHENTICATED')) router.replace('/sign-in');
  }, [venues.error, router]);

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {venues.isPending ? <Spinner label={tc('loading')} /> : null}
      {venues.isError && !isApiError(venues.error, 'UNAUTHENTICATED') ? (
        <Alert tone="error">{errorMessage(venues.error)}</Alert>
      ) : null}
      {venues.data?.items.length === 0 ? (
        <Card className="flex flex-col items-start gap-2">
          <span className="grid size-11 place-items-center rounded-full bg-brand-50 text-primary">
            <Icon name="grid" className="size-5" />
          </span>
          <p className="font-semibold text-ink">{t('empty')}</p>
          <p className="text-sm text-ink-muted">{t('emptyHint')}</p>
          <Link href="/manage/register" className={buttonClass({ size: 'sm', className: 'mt-2' })}>
            {t('registerCta')}
          </Link>
        </Card>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {venues.data?.items.map((v) => {
          // Self-registered owners have one venue per organization, auto-named from it — showing
          // the org name above the (identical) venue name would just repeat it.
          const sameName = pick(v.organizationName, locale) === pick(v.name, locale);
          return (
            <li key={v.id} className="min-w-0">
              <Link
                href={`/manage/${v.id}`}
                data-testid="managed-venue"
                className="group flex h-full items-center gap-4 rounded-card border border-line bg-surface p-4 pe-5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-lift"
              >
                <span className="relative size-20 shrink-0 overflow-hidden rounded-tile bg-night">
                  {v.coverMediaId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- owner-scoped preview, works pre-approval
                    <img
                      src={`/api/v1/manage/media/${v.coverMediaId}`}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <CourtArt variant="top" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {!sameName ? (
                    <span className="eyebrow truncate">{pick(v.organizationName, locale)}</span>
                  ) : null}
                  <span className="truncate text-lg font-bold group-hover:text-primary">
                    {pick(v.name, locale)}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Badge>{tc(`roles.${v.role}`)}</Badge>
                    {v.status !== 'approved' ? (
                      <Badge className="bg-accent-300/70">{t(`statusBadge.${v.status}`)}</Badge>
                    ) : null}
                  </span>
                </span>
                <Icon name="chevron" className="size-5 shrink-0 text-ink-muted rtl:rotate-180" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
