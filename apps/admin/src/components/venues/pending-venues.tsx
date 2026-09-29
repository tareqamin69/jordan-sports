'use client';

import { adminListPendingVenues, type VenueStatus } from '@jordan-sports/contracts';
import { Alert, Badge, Card, ListSkeleton, Ltr, PageHeader, SelectField } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

const filters = ['submitted', 'draft', 'approved', 'rejected', 'suspended'] as const;

/** WhatsApp deep links take digits only (no leading "+"). */
function waHref(phone: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '')}`;
}

export function PendingVenues() {
  const t = useTranslations('admin.venues');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState<VenueStatus>('submitted');
  const venues = useQuery({
    queryKey: ['pending-venues', status],
    queryFn: () => api(adminListPendingVenues, { query: { status } }),
  });

  return (
    <>
      <PageHeader title={t('pendingTitle')} description={t('pendingDescription')} />
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SelectField
            label={t('pendingFilter')}
            value={status}
            onChange={(e) => setStatus(e.target.value as VenueStatus)}
            name="status"
          >
            {filters.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </SelectField>
        </div>
        {venues.isPending ? <ListSkeleton label={tc('loading')} rows={3} /> : null}
        {venues.isError ? (
          <Alert tone="error" className="mt-3">
            {errorMessage(venues.error)}
          </Alert>
        ) : null}
        {venues.data && venues.data.items.length === 0 ? (
          <p className="mt-3 text-ink-muted" data-testid="venues-empty">
            {t(`emptyByStatus.${status}`)}
          </p>
        ) : null}
        <ul className="mt-3 divide-y divide-line">
          {venues.data?.items.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <Link href={`/venues/${v.id}`} className="min-w-0 hover:underline">
                <span className="block font-medium">{pick(v.name, locale)}</span>
                <span className="text-sm text-ink-muted">
                  {t('owner')}: {v.ownerName ?? '—'}
                  {v.ownerPhone ? (
                    <>
                      {' · '}
                      <Ltr>{v.ownerPhone}</Ltr>
                    </>
                  ) : null}
                </span>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{t(`statuses.${v.status}`)}</Badge>
                {v.ownerPhone ? (
                  <>
                    <a
                      href={`tel:${v.ownerPhone}`}
                      className="rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:bg-canvas"
                    >
                      {t('call')}
                    </a>
                    <a
                      href={waHref(v.ownerPhone)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:bg-canvas"
                    >
                      {t('whatsapp')}
                    </a>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
