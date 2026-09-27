'use client';

import { cancelBooking, confirmBooking, getBooking, type Booking } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  Ltr,
  PageHeader,
  Spinner,
} from '@jordan-sports/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { isApiError, useApi } from '@/lib/api';
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
  const freeUntil = new Date(b.cancellation.freeUntil);
  const late = now > freeUntil.getTime();

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

  const when = format.dateTime(freeUntil, {
    dateStyle: 'medium',
    timeStyle: 'short',
    numberingSystem: 'latn',
    timeZone: b.timezone,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={b.status === 'HELD' && !expired ? t('heldTitle') : t('title')}
        actions={
          <Badge data-testid="booking-status">
            {t(`statuses.${expired ? 'EXPIRED' : b.status}`)}
          </Badge>
        }
      />
      {b.status === 'HELD' && !expired ? (
        <Alert tone="warning" data-testid="hold-countdown">
          {t('countdown', { time: remaining(holdLeft) })}
        </Alert>
      ) : null}
      {b.status === 'CONFIRMED' ? <Alert tone="success">{t('confirmed')}</Alert> : null}
      {expired ? <Alert tone="warning">{t('expired')}</Alert> : null}
      {b.status === 'CANCELLED' && b.cancelledBy === 'venue' ? (
        <Alert tone="warning">{t('cancelledByVenue', { reason: b.cancelReason ?? '' })}</Alert>
      ) : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-ink-muted">{t('venue')}</dt>
            <dd className="mt-1 font-medium">
              <Link href={`/venues/${b.venue.slug}`} className="underline">
                {pick(b.venue.name, locale)}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">{t('resource')}</dt>
            <dd className="mt-1 font-medium">{pick(b.resource.name, locale)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">{t('date')}</dt>
            <dd className="mt-1 font-medium">
              {format.dateTime(dateForLabel(b.businessDate), 'dayMonth')}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">{t('time')}</dt>
            <dd className="mt-1 font-medium">
              <Ltr>
                {b.localStart}–{b.localEnd}
              </Ltr>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">{t('price')}</dt>
            <dd className="mt-1 font-medium" data-testid="booking-price">
              {b.price ? formatMoney(b.price, locale) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">{t('reference')}</dt>
            <dd className="mt-1 font-mono font-medium" data-testid="booking-reference">
              <Ltr>{b.reference}</Ltr>
            </dd>
          </div>
        </dl>
      </Card>

      {b.status === 'HELD' && !expired ? (
        <Card className="flex flex-col gap-4">
          <ul className="list-disc ps-5 text-sm">
            <li>{t('payAtVenue')}</li>
            <li>{t('freeUntil', { date: when })}</li>
            <li>{t('lateNote')}</li>
          </ul>
          <CheckboxField
            label={t('accept')}
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={confirm} disabled={!accepted} busy={busy === 'confirm'}>
              {t('confirm')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void cancel(t('released'))}
              busy={busy === 'cancel'}
            >
              {t('release')}
            </Button>
          </div>
        </Card>
      ) : null}

      {b.status === 'CONFIRMED' && new Date(b.start).getTime() > now ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm">{t('freeUntil', { date: when })}</p>
          {asking ? (
            <div className="flex flex-col gap-3">
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
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setAsking(true)}>
                {t('cancel')}
              </Button>
              {b.venue.contactPhone ? (
                <a
                  href={`tel:${b.venue.contactPhone}`}
                  className="rounded-md px-4 py-2.5 font-medium text-brand-800 underline"
                >
                  {t('callVenue')}
                </a>
              ) : null}
            </div>
          )}
        </Card>
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
