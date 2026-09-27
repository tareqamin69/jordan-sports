'use client';

import { listManagedVenues } from '@jordan-sports/contracts';
import { Alert, Badge, PageHeader, Spinner } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError, useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';
import { CourtArt } from '../court-art';
import { Icon } from '../icons';

export function ManageHome() {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const venues = useQuery({ queryKey: ['managed-venues'], queryFn: () => api(listManagedVenues) });

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
      {venues.data?.items.length === 0 ? <p className="text-ink-muted">{t('empty')}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {venues.data?.items.map((v) => (
          <li key={v.id} className="min-w-0">
            <Link
              href={`/manage/${v.id}`}
              data-testid="managed-venue"
              className="group flex h-full items-center gap-4 rounded-card border border-line bg-surface p-4 pe-5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-lift"
            >
              <span className="relative size-20 shrink-0 overflow-hidden rounded-tile bg-night">
                <CourtArt variant="top" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="eyebrow truncate">{pick(v.organizationName, locale)}</span>
                <span className="truncate text-lg font-bold group-hover:text-primary">
                  {pick(v.name, locale)}
                </span>
                <span className="flex flex-wrap gap-2">
                  <Badge>{tc(`roles.${v.role}`)}</Badge>
                  {v.status !== 'approved' ? (
                    <Badge className="bg-accent-300/70">{t('notPublic')}</Badge>
                  ) : null}
                </span>
              </span>
              <Icon name="chevron" className="size-5 shrink-0 text-ink-muted rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
