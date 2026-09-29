'use client';

import {
  checkInBooking,
  listVenueBookings,
  markNoShow,
  type VenueBooking,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import { Alert, Badge, Button, Card, Ltr, Spinner } from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { can } from '@/lib/manage';
import { businessToday } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

/** The current time, refreshed every 30 seconds (button windows open and close with it). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Front desk: today's bookings in time order, with arrival and no-show buttons. */
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['venue-bookings', venueId] }),
  });
  const canMark = can(schedule, 'booking.checkin');
  const now = useNow();
  const items = (bookings.data?.items ?? []).filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'NO_SHOW',
  );

  if (bookings.isPending) return <Spinner label={tc('loading')} />;
  if (bookings.isError) return <Alert tone="error">{errorMessage(bookings.error)}</Alert>;

  return (
    <div className="flex flex-col gap-3" data-testid="today-panel">
      <p className="text-ink-muted">{t('intro')}</p>
      {mark.isError ? <Alert tone="error">{errorMessage(mark.error)}</Alert> : null}
      {items.length === 0 ? <p className="text-ink-muted">{t('empty')}</p> : null}
      {items.map((b: VenueBooking) => {
        const start = new Date(b.start).getTime();
        const end = new Date(b.end).getTime();
        const canCheckIn =
          !b.checkedInAt && b.status !== 'NO_SHOW' && now >= start - 3_600_000 && now <= end;
        const canNoShow = !b.checkedInAt && b.status !== 'NO_SHOW' && now >= start;
        return (
          <Card
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-3"
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
                {b.customer.name ?? '—'}{' '}
                {b.customer.phone ? (
                  <a href={`tel:${b.customer.phone}`} className="text-primary">
                    <Ltr>{b.customer.phone}</Ltr>
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
