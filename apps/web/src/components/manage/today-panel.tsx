'use client';

import {
  checkInBooking,
  listVenueBookings,
  markNoShow,
  type VenueBooking,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import { Alert, Badge, Button, Card, EmptyState, ListSkeleton, Ltr, cx } from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { displayPhone } from '@/lib/format';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { can } from '@/lib/manage';
import { businessToday } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';
import { useNow } from '@/lib/use-now';

/**
 * Front desk "command centre": today at a glance (bookings, arrived, still to come), what is on
 * now and what is next, then today's bookings in time order with arrival and no-show buttons.
 */
export function TodayPanel({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.today');
  const tc = useTranslations('common');
  const tb = useTranslations('web.booking');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const venueId = schedule.venue.id;
  const today = businessToday(schedule.venue.timezone, schedule.venue.businessDayStartMinute);
  const key = ['venue-bookings', venueId, today, today];
  const bookings = useQuery({
    queryKey: key,
    queryFn: () =>
      api(listVenueBookings, { params: { venueId }, query: { from: today, to: today } }),
    refetchInterval: 60_000,
  });
  const mark = useMutation({
    mutationFn: (v: { id: string; arrived: boolean }) =>
      api(v.arrived ? checkInBooking : markNoShow, { params: { bookingId: v.id } }),
    meta: { toast: tc('toast.updated') },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venue-bookings', venueId] }),
  });
  const canMark = can(schedule, 'booking.checkin');
  const now = useNow();
  const items = (bookings.data?.items ?? []).filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'NO_SHOW',
  );

  if (bookings.isPending) return <ListSkeleton label={tc('loading')} rows={3} thumb={false} />;
  if (bookings.isError) return <Alert tone="error">{errorMessage(bookings.error)}</Alert>;

  const live = items.filter((b) => b.status !== 'NO_SHOW');
  const arrived = live.filter((b) => b.checkedInAt).length;
  const upcoming = live.filter((b) => new Date(b.start).getTime() > now);
  const playing = live.filter(
    (b) => new Date(b.start).getTime() <= now && new Date(b.end).getTime() > now,
  );
  const next = upcoming[0];
  const minutesTo = next
    ? Math.max(1, Math.round((new Date(next.start).getTime() - now) / 60_000))
    : 0;
  const tiles: Array<[string, number, string]> = [
    [t('stats.total'), live.length, 'total'],
    [t('stats.arrived'), arrived, 'arrived'],
    [t('stats.upcoming'), upcoming.length, 'upcoming'],
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="today-panel">
      {items.length > 0 ? (
        <>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="today-stats">
            {tiles.map(([label, value, id]) => (
              <div key={id} className="flex flex-col gap-1 rounded-tile bg-sand-100 p-3 sm:p-4">
                <dt className="text-xs text-sand-700">{label}</dt>
                <dd className="font-display text-2xl tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {playing.length > 0 || next ? (
            <div className="flex flex-col gap-2 rounded-card bg-brand-900 p-4 text-canvas sm:flex-row sm:items-center sm:justify-between">
              {playing.length > 0 ? (
                <p className="flex items-center gap-2 text-sm" data-testid="today-now">
                  <span aria-hidden className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-60 motion-reduce:hidden" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-lime" />
                  </span>
                  {t('now', {
                    courts: playing.map((b) => pick(b.resource.name, locale)).join('، '),
                  })}
                </p>
              ) : null}
              {next ? (
                <p className="text-sm text-canvas/85" data-testid="today-next">
                  {t('next', {
                    time: next.localStart,
                    court: pick(next.resource.name, locale),
                    minutes: minutesTo,
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      <p className="text-ink-muted">{t('intro')}</p>
      {mark.isError ? <Alert tone="error">{errorMessage(mark.error)}</Alert> : null}
      {items.length === 0 ? <EmptyState art="bookings" title={t('empty')} /> : null}
      {items.map((b: VenueBooking) => {
        const start = new Date(b.start).getTime();
        const end = new Date(b.end).getTime();
        const canCheckIn =
          !b.checkedInAt && b.status !== 'NO_SHOW' && now >= start - 3_600_000 && now <= end;
        const canNoShow = !b.checkedInAt && b.status !== 'NO_SHOW' && now >= start;
        return (
          <Card
            key={b.id}
            className={cx(
              'flex animate-rise flex-wrap items-center justify-between gap-3',
              now >= start &&
                now < end &&
                b.status !== 'NO_SHOW' &&
                'border-primary ring-2 ring-primary/15',
              (now >= end || b.status === 'NO_SHOW') && 'opacity-70',
            )}
            data-testid="today-booking"
          >
            <div className="min-w-0">
              <p className="font-display text-xl">
                <Ltr>
                  {b.localStart}–{b.localEnd}
                </Ltr>{' '}
                · {pick(b.resource.name, locale)}
              </p>
              <p className="text-sm">
                {b.customer.name ?? '-'}{' '}
                {b.customer.phone ? (
                  <a href={`tel:${b.customer.phone}`} className="text-primary">
                    <Ltr>{displayPhone(b.customer.phone)}</Ltr>
                  </a>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {b.checkedInAt ? <Badge>{t('arrived')}</Badge> : null}
              {b.status === 'NO_SHOW' ? <Badge>{tb('statuses.NO_SHOW')}</Badge> : null}
              {canMark && canCheckIn ? (
                <Button
                  size="sm"
                  busy={mark.isPending && mark.variables?.id === b.id && mark.variables.arrived}
                  onClick={() => mark.mutate({ id: b.id, arrived: true })}
                >
                  {t('checkIn')}
                </Button>
              ) : null}
              {canMark && canNoShow ? (
                <Button
                  size="sm"
                  variant="secondary"
                  busy={mark.isPending && mark.variables?.id === b.id && !mark.variables.arrived}
                  onClick={() => mark.mutate({ id: b.id, arrived: false })}
                >
                  {t('noShow')}
                </Button>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
