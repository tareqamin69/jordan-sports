'use client';

import { listMyBookings } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Badge, Card, Ltr, PageHeader, Spinner, cx } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError, useApi } from '@/lib/api';
import { dmy } from '@/lib/format';
import { pick } from '@/lib/localized';
import { dateForLabel } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

type Scope = 'upcoming' | 'past';

export function MyBookings() {
  const t = useTranslations('web.myBookings');
  const tb = useTranslations('web.booking');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [scope, setScope] = useState<Scope>('upcoming');
  const bookings = useQuery({
    queryKey: ['my-bookings', scope],
    queryFn: () => api(listMyBookings, { query: { scope } }),
  });

  useEffect(() => {
    if (isApiError(bookings.error, 'UNAUTHENTICATED')) {
      router.replace({ pathname: '/sign-in', query: { next: '/bookings' } });
    }
  }, [bookings.error, router]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} />
      <div role="group" aria-label={t('title')} className="flex gap-2">
        {(['upcoming', 'past'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scope === s}
            onClick={() => setScope(s)}
            className={cx(
              'rounded-md border px-4 py-2 text-sm font-medium',
              scope === s
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-line bg-surface text-ink hover:bg-canvas',
            )}
          >
            {t(s)}
          </button>
        ))}
      </div>
      {bookings.isPending ? <Spinner label={tc('loading')} /> : null}
      {bookings.isError && !isApiError(bookings.error, 'UNAUTHENTICATED') ? (
        <Alert tone="error">{errorMessage(bookings.error)}</Alert>
      ) : null}
      {bookings.data?.items.length === 0 ? (
        <Card>
          <p className="text-ink-muted">{t('empty')}</p>
          <Link href="/venues" className="mt-3 inline-block font-medium text-brand-800 underline">
            {t('browse')}
          </Link>
        </Card>
      ) : null}
      <ul className="flex flex-col gap-3">
        {bookings.data?.items.map((b) => (
          <li key={b.id}>
            <Link
              href={`/bookings/${b.id}`}
              data-testid="my-booking"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4 hover:bg-canvas"
            >
              <span className="flex flex-col gap-1">
                <span className="font-bold">
                  {pick(b.venue.name, locale)} · {pick(b.resource.name, locale)}
                </span>
                <span className="text-sm text-ink-muted">
                  {format.dateTime(dateForLabel(b.businessDate), { weekday: 'long' })}{' '}
                  {dmy(b.businessDate)}{' '}
                  <Ltr>
                    {b.localStart}–{b.localEnd}
                  </Ltr>
                </span>
              </span>
              <span className="flex items-center gap-3">
                {b.price ? <span className="text-sm">{formatMoney(b.price, locale)}</span> : null}
                <Badge>{tb(`statuses.${b.status}`)}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
