'use client';

import { cancelBooking, confirmBooking, getBooking, type Booking } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Button, Card, CheckboxField, Ltr, Spinner, cx } from '@jordan-sports/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError, useApi } from '@/lib/api';
import {
  dateInZone,
  directionsUrl,
  dmy,
  googleCalendarUrl,
  icsFile,
  timeInZone,
  whatsappShareUrl,
  type CalendarEvent,
} from '@/lib/format';
import { pick } from '@/lib/localized';
import { dateForLabel } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** "m:ss" with Western digits. */
function remaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const statusTone: Record<Booking['status'], string> = {
  HELD: 'bg-accent-300/50 text-ink',
  CONFIRMED: 'bg-brand-100 text-brand-900',
  CANCELLED: 'bg-danger/10 text-danger',
  EXPIRED: 'bg-canvas text-ink-muted',
  COMPLETED: 'bg-canvas text-ink',
  NO_SHOW: 'bg-canvas text-ink-muted',
};

const actionClass =
  'flex min-h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-center text-sm font-medium text-brand-900 hover:bg-canvas';

export function BookingView({ bookingId }: { bookingId: string }) {
  const t = useTranslations('web.booking');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // One key per page visit: a retried confirmation is recognized by the server.
  const confirmKey = useMemo(() => crypto.randomUUID(), []);

  const booking = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api(getBooking, { params: { bookingId } }),
  });
  const data = booking.data;
  const now = useNow(data?.status === 'HELD');

  useEffect(() => {
    if (isApiError(booking.error, 'UNAUTHENTICATED')) {
      router.replace({ pathname: '/sign-in', query: { next: `/bookings/${bookingId}` } });
    }
  }, [booking.error, router, bookingId]);

  if (booking.isPending) return <Spinner label={tc('loading')} />;
  if (booking.isError) return <Alert tone="error">{errorMessage(booking.error)}</Alert>;
  const b = data!;

  const holdLeft = b.holdExpiresAt ? new Date(b.holdExpiresAt).getTime() - now : 0;
  const expired = b.status === 'EXPIRED' || (b.status === 'HELD' && holdLeft <= 0);
  const status = expired ? 'EXPIRED' : b.status;
  const holding = b.status === 'HELD' && !expired;
  const freeUntil = new Date(b.cancellation.freeUntil);
  const late = now > freeUntil.getTime();
  const venueName = pick(b.venue.name, locale);
  const resourceName = pick(b.resource.name, locale);
  const address = pick(b.venue.address, locale);
  const weekday = format.dateTime(dateForLabel(b.businessDate), { weekday: 'long' });
  const freeUntilText = `${dmy(dateInZone(freeUntil, b.timezone))} ${timeInZone(freeUntil, b.timezone)}`;

  const update = (next: Booking) => {
    queryClient.setQueryData(['booking', bookingId], next);
    void queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    void queryClient.invalidateQueries({ queryKey: ['availability', b.venue.slug] });
  };

  async function run(kind: 'confirm' | 'cancel', action: () => Promise<Booking>, done?: string) {
    setBusy(kind);
    setError(null);
    try {
      update(await action());
      setNotice(done ?? null);
      setAsking(false);
    } catch (e) {
      setError(errorMessage(e));
      if (isApiError(e, 'HOLD_EXPIRED')) await booking.refetch();
    } finally {
      setBusy(null);
    }
  }

  const confirm = () =>
    run('confirm', () =>
      api(confirmBooking, {
        params: { bookingId },
        body: { paymentMethod: 'PAY_AT_VENUE', acceptCancellationPolicy: true },
        idempotencyKey: confirmKey,
      }),
    );
  const cancel = (done: string) =>
    run('cancel', () => api(cancelBooking, { params: { bookingId }, body: {} }), done);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const venueUrl = `${origin}/${locale}/venues/${b.venue.slug}`;
  const event: CalendarEvent = {
    uid: `${b.id}@jordan-sports`,
    title: `${resourceName} — ${venueName}`,
    location: [venueName, address].filter(Boolean).join('، '),
    description: `${t('reference')}: ${b.reference}\n${venueUrl}`,
    start: new Date(b.start),
    end: new Date(b.end),
  };
  const downloadIcs = () => {
    const url = URL.createObjectURL(new Blob([icsFile(event)], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `booking-${b.reference}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const invite = t('inviteText', {
    resource: resourceName,
    venue: venueName,
    day: weekday,
    date: dmy(b.businessDate),
    time: b.localStart,
    link: venueUrl,
  });

  return (
    <div className={cx('flex flex-col gap-4', holding && 'pb-28 sm:pb-0')}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{holding ? t('heldTitle') : t('title')}</h1>
        <span
          data-testid="booking-status"
          className={cx('rounded-full px-3 py-1 text-sm font-medium', statusTone[status])}
        >
          {t(`statuses.${status}`)}
        </span>
      </div>

      {b.status === 'CONFIRMED' ? <Alert tone="success">{t('confirmed')}</Alert> : null}
      {expired ? <Alert tone="warning">{t('expired')}</Alert> : null}
      {b.status === 'CANCELLED' && b.cancelledBy === 'venue' ? (
        <Alert tone="warning">{t('cancelledByVenue', { reason: b.cancelReason ?? '' })}</Alert>
      ) : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/venues/${b.venue.slug}`} className="font-bold underline">
              {venueName}
            </Link>
            <p className="text-sm text-ink-muted">{resourceName}</p>
          </div>
          <p className="shrink-0 text-lg font-bold" data-testid="booking-price">
            {b.price ? formatMoney(b.price, locale) : null}
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-medium">{weekday}</span>
          <Ltr>{dmy(b.businessDate)}</Ltr>
          <span aria-hidden>·</span>
          <Ltr>
            {b.localStart}–{b.localEnd}
          </Ltr>
        </p>
        <p className="text-xs text-ink-muted">
          {t('reference')}:{' '}
          <span className="font-mono text-sm text-ink" data-testid="booking-reference">
            <Ltr>{b.reference}</Ltr>
          </span>
        </p>
      </Card>

      {holding ? (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm">
            {t('payAtVenue')} · {t('freeUntil', { date: freeUntilText })}
          </p>
          <details className="text-sm text-ink-muted">
            <summary className="cursor-pointer">{t('termsDetails')}</summary>
            <p className="mt-1">{t('lateNote')}</p>
          </details>
          <CheckboxField
            label={t('accept')}
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <Button
                className="flex-1 sm:flex-none"
                onClick={confirm}
                disabled={!accepted}
                busy={busy === 'confirm'}
              >
                {t('confirm')}
              </Button>
              <span
                data-testid="hold-countdown"
                className="shrink-0 rounded-full bg-accent-300/50 px-3 py-1.5 text-sm"
              >
                {t('countdown', { time: remaining(holdLeft) })}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => void cancel(t('released'))}
            busy={busy === 'cancel'}
          >
            {t('release')}
          </Button>
        </Card>
      ) : null}

      {b.status === 'CONFIRMED' ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" className={actionClass} onClick={() => setCalendarOpen((o) => !o)}>
            {t('addToCalendar')}
          </button>
          <a
            className={actionClass}
            href={directionsUrl(b.venue.location, `${venueName} ${address}`)}
            target="_blank"
            rel="noreferrer"
          >
            {t('directions')}
          </a>
          <a
            className={actionClass}
            href={whatsappShareUrl(invite)}
            target="_blank"
            rel="noreferrer"
          >
            {t('inviteFriends')}
          </a>
          {b.venue.contactPhone ? (
            <a className={actionClass} href={`tel:${b.venue.contactPhone}`}>
              {t('callVenue')}
            </a>
          ) : null}
          {calendarOpen ? (
            <div className="col-span-2 flex flex-col gap-2 rounded-md border border-line bg-surface p-3 sm:col-span-4">
              <a
                className="font-medium text-brand-800 underline"
                href={googleCalendarUrl(event)}
                target="_blank"
                rel="noreferrer"
              >
                {t('googleCalendar')}
              </a>
              <button
                type="button"
                className="text-start font-medium text-brand-800 underline"
                onClick={downloadIcs}
              >
                {t('otherCalendar')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {b.status === 'CONFIRMED' && new Date(b.start).getTime() > now ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">{t('freeUntil', { date: freeUntilText })}</p>
          {asking ? (
            <Card className="flex flex-col gap-3 p-4">
              <p className="font-medium">{late ? t('lateQuestion') : t('cancelQuestion')}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="danger"
                  onClick={() => void cancel(t('statuses.CANCELLED'))}
                  busy={busy === 'cancel'}
                >
                  {t('cancelConfirm')}
                </Button>
                <Button variant="secondary" onClick={() => setAsking(false)}>
                  {t('keep')}
                </Button>
              </div>
            </Card>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-danger"
              onClick={() => setAsking(true)}
            >
              {t('cancel')}
            </Button>
          )}
        </div>
      ) : null}

      {b.status === 'CANCELLED' && b.cancellation.late ? (
        <p className="text-sm text-ink-muted">{t('lateCancelled')}</p>
      ) : null}

      {expired || b.status === 'CANCELLED' ? (
        <Link
          href={`/venues/${b.venue.slug}`}
          className="self-start rounded-md bg-brand-700 px-4 py-2.5 font-medium text-white hover:bg-brand-800"
        >
          {t('chooseAgain')}
        </Link>
      ) : null}
    </div>
  );
}
