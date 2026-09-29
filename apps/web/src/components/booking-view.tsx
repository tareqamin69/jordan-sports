'use client';

import { cancelBooking, confirmBooking, getBooking, type Booking } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  Ltr,
  Skeleton,
  SkeletonGroup,
  buttonClass,
  cx,
  useToast,
} from '@jordan-sports/ui';
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
import { BookingSuccess } from './booking-success';
import { CliqCheckout, CliqPaymentSummary } from './cliq-checkout';
import { CourtArt } from './court-art';
import { HoldCountdown } from './hold-countdown';
import { Icon } from './icons';

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
  HELD: 'bg-accent-300/70 text-ink',
  CONFIRMED: 'bg-brand-100 text-brand-900',
  CANCELLED: 'bg-danger/10 text-danger',
  EXPIRED: 'bg-canvas-deep text-ink',
  COMPLETED: 'bg-canvas-deep text-ink',
  NO_SHOW: 'bg-canvas-deep text-ink',
};

const actionClass =
  'flex min-h-12 items-center justify-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-center text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-canvas';

/**
 * `justConfirmed` (from `?confirmed=1`) shows the success banner; later visits do not (QA #5).
 */
export function BookingView({
  bookingId,
  justConfirmed = false,
}: {
  bookingId: string;
  justConfirmed?: boolean;
}) {
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
  const [asking, setAsking] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(justConfirmed);
  const toast = useToast();
  const [calendarOpen, setCalendarOpen] = useState(false);
  // One key per page visit: a retried confirmation is recognized by the server.
  const confirmKey = useMemo(() => crypto.randomUUID(), []);

  const booking = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api(getBooking, { params: { bookingId } }),
    // While the venue checks a CliQ transfer, pick up its answer without a reload.
    refetchInterval: (q) =>
      q.state.data?.status === 'HELD' && q.state.data.payment?.status === 'SUBMITTED'
        ? 10_000
        : false,
  });
  const data = booking.data;
  const now = useNow(data?.status === 'HELD');

  useEffect(() => {
    if (isApiError(booking.error, 'UNAUTHENTICATED')) {
      router.replace({ pathname: '/sign-in', query: { next: `/bookings/${bookingId}` } });
    }
  }, [booking.error, router, bookingId]);

  if (booking.isPending) return <BookingSkeleton label={tc('loading')} />;
  if (booking.isError) return <Alert tone="error">{errorMessage(booking.error)}</Alert>;
  const b = data!;

  const holdLeft = b.holdExpiresAt ? new Date(b.holdExpiresAt).getTime() - now : 0;
  const holdTotal = b.holdExpiresAt
    ? new Date(b.holdExpiresAt).getTime() - new Date(b.createdAt).getTime()
    : 0;
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
    try {
      update(await action());
      if (done) toast(done, 'info');
      setAsking(false);
    } catch (e) {
      toast(errorMessage(e), 'error');
      if (isApiError(e, 'HOLD_EXPIRED')) await booking.refetch();
    } finally {
      setBusy(null);
    }
  }

  const confirm = async () => {
    await run('confirm', async () => {
      const confirmed = await api(confirmBooking, {
        params: { bookingId },
        body: { paymentMethod: 'PAY_AT_VENUE', acceptCancellationPolicy: true },
        idempotencyKey: confirmKey,
      });
      // The banner belongs to this moment only: it is tied to the URL, so a reload right after
      // confirming keeps it and a later visit from "My bookings" does not.
      setShowConfirmed(true);
      window.history.replaceState(null, '', `${window.location.pathname}?confirmed=1`);
      return confirmed;
    });
  };
  const cancel = (done?: string) =>
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

  const cell = 'flex min-w-0 flex-col gap-0.5 px-4 py-3';

  return (
    <div className={cx('flex flex-col gap-4', holding && !b.payment && 'pb-44 md:pb-0')}>
      <button
        type="button"
        onClick={() => router.back()}
        className="-ms-2 flex h-10 w-fit items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
      >
        <Icon name="chevron" className="size-4 rotate-180 rtl:rotate-0" />
        {tc('actions.back')}
      </button>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2.25rem] leading-[1.2] sm:text-[2.75rem]">
            {holding ? t('heldTitle') : t('title')}
          </h1>
        </div>
        <span
          data-testid="booking-status"
          key={status}
          className={cx(
            'mb-2 animate-pop rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-base',
            statusTone[status],
          )}
        >
          {holding && b.payment?.status === 'SUBMITTED'
            ? t('awaitingVenue')
            : t(`statuses.${status}`)}
        </span>
      </div>

      {b.status === 'CONFIRMED' && showConfirmed ? (
        <BookingSuccess message={t('confirmed')} />
      ) : null}
      {expired ? <Alert tone="warning">{t('expired')}</Alert> : null}
      {b.status === 'CANCELLED' && b.cancelledBy === 'venue' ? (
        <Alert tone="warning">{t('cancelledByVenue', { reason: b.cancelReason ?? '' })}</Alert>
      ) : null}
      <CliqPaymentSummary booking={b} />

      <article className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="relative h-28 bg-night">
          <CourtArt icon={b.resource.icon ?? undefined} className="absolute inset-0 opacity-90" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-night/10 to-night/80"
          />
          <div className="absolute inset-x-5 bottom-3 flex items-end justify-between gap-3 text-canvas">
            <div className="min-w-0">
              <Link
                href={`/venues/${b.venue.slug}`}
                className="block truncate text-lg font-bold hover:underline focus-visible:outline-canvas"
              >
                {venueName}
              </Link>
              <p className="truncate text-sm text-canvas/85">{resourceName}</p>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-line border-b border-line">
          <div className={cell}>
            <dt className="text-[11px] text-ink-muted">{t('date')}</dt>
            <dd className="truncate text-sm font-semibold">
              {weekday} <Ltr>{dmy(b.businessDate).slice(0, 5)}</Ltr>
            </dd>
          </div>
          <div className={cell}>
            <dt className="text-[11px] text-ink-muted">{t('time')}</dt>
            <dd className="text-sm font-semibold">
              <Ltr>
                {b.localStart}–{b.localEnd}
              </Ltr>
            </dd>
          </div>
          <div className={cell}>
            <dt className="text-[11px] text-ink-muted">{t('price')}</dt>
            <dd className="text-sm font-bold text-primary" data-testid="booking-price">
              {b.price ? formatMoney(b.price, locale) : null}
            </dd>
          </div>
        </dl>
        <p className="flex items-center justify-between gap-3 px-5 py-4 text-sm">
          <span className="text-ink-muted">{t('reference')}</span>
          <span
            className="rounded-full bg-canvas px-3 py-1 font-mono text-sm font-semibold tracking-wider text-ink"
            data-testid="booking-reference"
          >
            <Ltr>{b.reference}</Ltr>
          </span>
        </p>
      </article>

      {holding && b.payment ? (
        <CliqCheckout
          booking={b}
          payment={b.payment}
          holdLeft={holdLeft}
          freeUntilText={freeUntilText}
          late={late}
          onUpdate={update}
          onRelease={() => void cancel(t('released'))}
          releasing={busy === 'cancel'}
        />
      ) : null}

      {holding && !b.payment ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-primary">
              <Icon name="pin" className="size-5" />
            </span>
            <p className="flex flex-col text-sm">
              <span className="font-semibold text-ink">{t('payAtVenue')}</span>
              <span className={cx('text-ink-muted', late && 'text-danger')}>
                {late ? t('freeCancellationUnavailable') : t('freeUntil', { date: freeUntilText })}
              </span>
            </p>
          </div>
          <details className="group rounded-2xl bg-canvas px-4 py-3 text-sm text-ink-muted">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-ink [&::-webkit-details-marker]:hidden">
              {t('termsDetails')}
              <Icon
                name="chevron"
                className="size-4 rotate-90 transition-transform group-open:-rotate-90"
              />
            </summary>
            <p className="mt-2 leading-7">{t('lateNote')}</p>
          </details>
          <CheckboxField
            label={t('accept')}
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          {/*
            The confirm bar is `fixed` on mobile (so it stays reachable while the page scrolls),
            which takes it out of normal flow — this invisible spacer of the same size keeps the
            rest of the card (the "release" link below) from sliding up underneath it.
          */}
          <div aria-hidden className="invisible rounded-card border border-line p-2.5 md:hidden">
            <div className="flex items-center gap-3">
              <span className="h-12 w-32 shrink-0 rounded-full" />
              <span className="h-14 flex-1 rounded-full" />
            </div>
          </div>
          <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 rounded-card border border-line bg-surface p-2.5 shadow-float md:static md:inset-auto md:bottom-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            <div className="flex items-center gap-3">
              <HoldCountdown holdLeft={holdLeft} total={holdTotal}>
                {t('countdown', { time: remaining(holdLeft) })}
              </HoldCountdown>
              <Button
                size="lg"
                className="flex-1 md:flex-none md:px-10"
                onClick={confirm}
                disabled={!accepted}
                busy={busy === 'confirm'}
              >
                {t('confirm')}
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="-ms-2 self-start"
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
            <Icon name="calendar" className="size-4" />
            {t('addToCalendar')}
          </button>
          <a
            className={actionClass}
            href={directionsUrl(b.venue.location, `${venueName} ${address}`)}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="pin" className="size-4" />
            {t('directions')}
          </a>
          <a
            className={actionClass}
            href={whatsappShareUrl(invite)}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="share" className="size-4" />
            {t('inviteFriends')}
          </a>
          <Link
            className={actionClass}
            href={{ pathname: '/support', query: { booking: b.id, ref: b.reference } }}
            data-testid="report-problem"
          >
            <Icon name="share" className="size-4" />
            {t('reportProblem')}
          </Link>
          {b.venue.contactPhone ? (
            <a className={actionClass} href={`tel:${b.venue.contactPhone}`}>
              <Icon name="phone" className="size-4" />
              {t('callVenue')}
            </a>
          ) : null}
          {calendarOpen ? (
            <div className="col-span-2 flex flex-col gap-1 rounded-tile border border-line bg-surface p-2 sm:col-span-4">
              <a
                className="rounded-2xl px-3 py-2.5 font-medium text-primary hover:bg-canvas"
                href={googleCalendarUrl(event)}
                target="_blank"
                rel="noreferrer"
              >
                {t('googleCalendar')}
              </a>
              <button
                type="button"
                className="rounded-2xl px-3 py-2.5 text-start font-medium text-primary hover:bg-canvas"
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
          <p className={cx('text-sm text-ink-muted', late && 'text-danger')}>
            {late ? t('freeCancellationUnavailable') : t('freeUntil', { date: freeUntilText })}
          </p>
          {asking ? (
            <Card className="flex animate-pop flex-col gap-4 p-5">
              <p className="font-medium">{late ? t('lateQuestion') : t('cancelQuestion')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  onClick={() => void cancel(t('cancelledNotice'))}
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
              variant="ghostDanger"
              size="sm"
              className="-ms-2 self-start"
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
        <Link href={`/venues/${b.venue.slug}`} className={buttonClass({ className: 'self-start' })}>
          {t('chooseAgain')}
        </Link>
      ) : null}
    </div>
  );
}

/** Placeholder shaped like the booking page (title, status, summary card, actions). */
function BookingSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="flex flex-col gap-4">
      <Skeleton className="h-10 w-24 rounded-full" />
      <div className="mb-2 flex items-end justify-between gap-3">
        <Skeleton className="h-11 w-56" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <Skeleton className="h-28 rounded-none" />
        <div className="grid grid-cols-3 gap-4 p-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-20" />
            </span>
          ))}
        </div>
      </div>
      <Skeleton className="h-40 rounded-card" />
    </SkeletonGroup>
  );
}
