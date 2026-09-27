'use client';

import { listManagedVenues } from '@jordan-sports/contracts';
import { Alert, Badge, Card, PageHeader, Spinner } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError, useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

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
      <ul className="grid gap-4 sm:grid-cols-2">
        {venues.data?.items.map((v) => (
          <li key={v.id}>
            <Link href={`/manage/${v.id}`} data-testid="managed-venue">
              <Card className="flex h-full flex-col gap-2 hover:border-brand-300">
                <span className="text-lg font-bold">{pick(v.name, locale)}</span>
                <span className="text-sm text-ink-muted">{pick(v.organizationName, locale)}</span>
                <span className="flex gap-2">
                  <Badge>{tc(`roles.${v.role}`)}</Badge>
                  {v.status !== 'approved' ? <Badge>{t('notPublic')}</Badge> : null}
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
