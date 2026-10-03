'use client';

import { listMyBookings } from '@jordan-sports/contracts/web';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  EmptyState,
  ListSkeleton,
  Ltr,
  PageHeader,
  buttonClass,
  chipClass,
} from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError, useApi } from '@/lib/api';
import { dmy } from '@/lib/format';
import { pick } from '@/lib/localized';
import { dateForLabel } from '@/lib/time';
import { PullToRefresh } from './pull-to-refresh';
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
    <PullToRefresh onRefresh={() => bookings.refetch()} label={tc('loading')}>
      <div className="flex animate-rise flex-col gap-6">
        <PageHeader title={t('title')} />
        <div role="group" aria-label={t('title')} className="-mt-4 flex gap-2">
          {(['upcoming', 'past'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={chipClass(scope === s, { tone: 'night' })}
            >
              {t(s)}
            </button>
          ))}
        </div>
        {bookings.isPending ? <ListSkeleton label={tc('loading')} rows={3} /> : null}
        {bookings.isError && !isApiError(bookings.error, 'UNAUTHENTICATED') ? (
          <Alert tone="error">{errorMessage(bookings.error)}</Alert>
        ) : null}
        {bookings.data?.items.length === 0 ? (
          <EmptyState
            art="bookings"
            title={t('empty')}
            action={
              <Link href="/venues" className={buttonClass({ size: 'sm' })}>
                {t('browse')}
              </Link>
            }
          />
        ) : null}
        <ul key={scope} className="reveal-stagger grid gap-3 lg:grid-cols-2">
          {bookings.data?.items.map((b) => (
            <li key={b.id} className="min-w-0">
              <Link
                href={`/bookings/${b.id}`}
                data-testid="my-booking"
                className="lift group flex items-center gap-4 rounded-tile border border-line bg-surface p-3 pe-4 hover:border-line-strong"
              >
                <span className="flex size-[76px] shrink-0 flex-col items-center justify-center rounded-[1.125rem] bg-primary text-on-primary">
                  <span className="text-[11px] leading-4 opacity-80">
                    {format.dateTime(dateForLabel(b.businessDate), { weekday: 'short' })}
                  </span>
                  <span className="font-display text-[1.75rem] leading-8">
                    {format.dateTime(dateForLabel(b.businessDate), {
                      day: 'numeric',
                      numberingSystem: 'latn',
                    })}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-semibold text-ink group-hover:text-primary">
                    {pick(b.venue.name, locale)}
                  </span>
                  <span className="truncate text-sm text-ink-muted">
                    {pick(b.resource.name, locale)} ·{' '}
                    <Ltr>
                      {b.localStart}–{b.localEnd}
                    </Ltr>{' '}
                    · {dmy(b.businessDate)}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <Badge>{tb(`statuses.${b.status}`)}</Badge>
                    {b.price ? (
                      <span className="text-sm font-semibold text-primary">
                        {formatMoney(b.price, locale)}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PullToRefresh>
  );
}
