'use client';

import {
  cancelBooking,
  getBooking,
  startCheckout,
  verifyCheckout,
  type Booking,
} from '@jordan-sports/contracts';
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
import { useEffect, useState } from 'react';
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
import { useCatalog } from '@/lib/catalog';
import { pick } from '@/lib/localized';
import { dateForLabel } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';
import { BookingSuccess } from './booking-success';
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
 * A player's booking: pay by card while held (ADR-0020), then details, cancel and refund.
 * `justConfirmed` (from `?confirmed=1`) shows the success banner; later visits do not (QA #5).
 * `returning` (from `?payment=return`): back from the payment page, so the outcome is checked.
 */
export function BookingView({
  bookingId,
  justConfirmed = false,
  returning = false,
}: {
  bookingId: string;
  justConfirmed?: boolean;
  returning?: boolean;
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
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null);
  const [verifying, setVerifying] = useState(returning);
  const [asking, setAsking] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(justConfirmed);
  const toast = useToast();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const booking = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api(getBooking, { params: { bookingId } }),
    // Back from the payment page, the verify call below returns the booking: fetching it in
    // parallel could land after it and overwrite the outcome with the pre-payment state.
    enabled: !verifying,
  });
  const data = booking.data;
  const now = useNow(data?.status === 'HELD');

  // Back from the payment page: ask for the outcome once, then drop ?payment=return from the URL.
  useEffect(() => {
    if (!returning) return;
    let live = true;
    api(verifyCheckout, { params: { bookingId } })
      .then((checked) => {
        if (!live) return;
        queryClient.setQueryData(['booking', bookingId], checked);
        void queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
        const paid = checked.status === 'CONFIRMED';
        if (paid) setShowConfirmed(true);
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${paid ? '?confirmed=1' : ''}`,
        );
      })
      .catch(() => undefined)
      .finally(() => live && setVerifying(false));
    return () => {
      live = false;
    };
  }, [returning, api, bookingId, queryClient]);

  useEffect(() => {
    if (isApiError(booking.error, 'UNAUTHENTICATED')) {
      router.replace({ pathname: '/sign-in', query: { next: `/bookings/${bookingId}` } });
    }
  }, [booking.error, router, bookingId]);

  if (booking.isPending || verifying) {
    return <BookingSkeleton label={verifying ? t('verifying') : tc('loading')} />;
  }
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

  async function run(kind: 'cancel', action: () => Promise<Booking>, done?: string) {
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

  // To the gateway's payment page; it sends the player back here with ?payment=return.
  const pay = async () => {
    setBusy('pay');
    try {
      const { redirectUrl } = await api(startCheckout, {
        params: { bookingId },
        body: {
          locale: locale as 'ar' | 'en',
          acceptCancellationPolicy: true,
          confirmAdult: true,
        },
      });
      window.location.assign(redirectUrl);
    } catch (e) {
      toast(errorMessage(e), 'error');
      if (isApiError(e, 'HOLD_EXPIRED')) await booking.refetch();
      setBusy(null);
    }
  };
  const failure = (code: string) =>
    t(
      `failures.${(['card_declined', 'insufficient_funds', 'expired_card', 'cancelled', 'abandoned'] as const).find((c) => c === code) ?? 'other'}`,
    );
  const pct = b.cancellation.lateRefundPercent;
  const refundPreview = b.price
    ? t('refundPreview', {
        kind: !late || pct === 100 ? 'full' : pct === 50 ? 'half' : 'none',
        amount: formatMoney(
          {
            ...b.price,
            amount:
              !late || pct === 100 ? b.price.amount : Math.round((b.price.amount * pct) / 100),
          },
          locale,
        ),
      })
    : null;
  const cancel = (done?: string) =>
    run('cancel', () => api(cancelBooking, { params: { bookingId }, body: {} }), done);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const venueUrl = `${origin}/${locale}/venues/${b.venue.slug}`;
  const event: CalendarEvent = {
    uid: `${b.id}@jordan-sports`,
    title: `${resourceName} · ${venueName}`,
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
    <div className="flex flex-col gap-4">
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
          <h1 className="font-display text-[2.25rem] leading-[1.3] sm:text-[2.75rem]">
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
          {t(`statuses.${status}`)}
        </span>
      </div>

      {b.status === 'CONFIRMED' && showConfirmed ? (
        <BookingSuccess message={t('confirmed')} />
      ) : null}
      {expired ? <Alert tone="warning">{t('expired')}</Alert> : null}
      {b.status === 'CANCELLED' && b.cancelledBy === 'venue' ? (
        <Alert tone="warning">{t('cancelledByVenue', { reason: b.cancelReason ?? '' })}</Alert>
      ) : null}
      {b.payment?.status === 'paid' && b.payment.card && !b.refund ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted" data-testid="booking-paid">
          <Icon name="check" className="size-4 text-primary" />
          {t('paid', {
            amount: formatMoney(b.payment.amount, locale),
            brand: b.payment.card.brand === 'visa' ? 'Visa' : 'Mastercard',
            last4: b.payment.card.last4,
          })}
        </p>
      ) : null}
      {b.refund ? (
        <Alert
          tone={b.refund.status === 'failed' ? 'warning' : 'info'}
          data-testid="booking-refund"
        >
          {t('refund', {
            status: b.refund.status,
            amount: formatMoney(b.refund.amount, locale),
          })}{' '}
          {b.refund.status !== 'failed' ? t('refundTiming') : null}
        </Alert>
      ) : null}

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

      {b.payment?.paidAt && b.price ? (
        <Receipt
          reference={b.reference}
          amount={formatMoney(b.payment.amount, locale)}
          paidAt={format.dateTime(new Date(b.payment.paidAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Amman',
            numberingSystem: 'latn',
          })}
          card={
            b.payment.card
              ? `${b.payment.card.brand === 'visa' ? 'Visa' : 'Mastercard'} •••• ${b.payment.card.last4}`
              : null
          }
        />
      ) : null}

      {holding ? (
        <Card className="flex flex-col gap-4 p-5" data-testid="card-checkout">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-primary">
              <Icon name="card" className="size-5" />
            </span>
            <p className="flex flex-col gap-0.5 text-sm">
              <span className="font-semibold text-ink">{t('payCard')}</span>
              <span className="text-ink-muted">{t('paySecure')}</span>
              <span className={cx('text-ink-muted', late && 'text-danger')}>
                {late ? t('freeCancellationUnavailable') : t('freeUntil', { date: freeUntilText })}
              </span>
            </p>
          </div>
          {b.price ? (
            <div
              className="flex flex-col gap-2 rounded-tile bg-sand-100 px-4 py-3.5 text-sm"
              data-testid="checkout-summary"
            >
              <dl className="flex flex-col gap-2">
                <div className="flex justify-between gap-4">
                  <dt className="text-sand-700">
                    {resourceName} ·{' '}
                    <Ltr>
                      {b.localStart}–{b.localEnd}
                    </Ltr>
                  </dt>
                  <dd>
                    <Ltr>{formatMoney(b.price, locale)}</Ltr>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-sand-300 pt-2">
                  <dt className="font-semibold text-ink">{t('total')}</dt>
                  <dd className="font-display text-xl text-primary">
                    <Ltr>{formatMoney(b.price, locale)}</Ltr>
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-sand-700">{t('totalNote')}</p>
            </div>
          ) : null}
          <details className="group rounded-tile bg-canvas px-4 py-3 text-sm text-ink-muted">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-ink [&::-webkit-details-marker]:hidden">
              {t('termsDetails')}
              <Icon
                name="chevron"
                className="size-4 rotate-90 transition-transform group-open:-rotate-90"
              />
            </summary>
            <p className="mt-2 leading-7">
              {late ? null : `${t('freeUntil', { date: freeUntilText })} `}
              {t('lateNote', { percent: String(pct) })} {t('refundTiming')}
            </p>
            <Link
              href="/refunds"
              className="mt-2 inline-block font-medium text-primary hover:underline"
            >
              {t('fullTerms')}
            </Link>
          </details>
          {b.payment?.lastFailure ? (
            <Alert tone="error" data-testid="payment-failed">
              {t('paymentFailed', { reason: failure(b.payment.lastFailure) })}
            </Alert>
          ) : null}
          {/*
            Phones: sticks above the tab bar while the checkout card is on screen, then scrolls
            away with it (so it never covers the footer). Wider screens: inline.
          */}
          <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 -mx-2 rounded-card border border-line bg-surface p-2.5 shadow-float flex flex-col gap-2.5 md:static md:mx-0 md:border-0 md:bg-transparent md:gap-4 md:p-0 md:shadow-none">
            {/* The terms box travels with the pay button, so it is never hidden behind it. */}
            <div className="px-1.5 md:px-0">
              <CheckboxField
                label={t('accept')}
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
            </div>
            <div className="flex items-center gap-3">
              <HoldCountdown holdLeft={holdLeft} total={holdTotal}>
                {t('countdown', { time: remaining(holdLeft) })}
              </HoldCountdown>
              <Button
                size="lg"
                className="flex-1 whitespace-nowrap px-4 md:flex-none md:px-10"
                onClick={() => void pay()}
                disabled={!accepted}
                busy={busy === 'pay'}
                data-testid="pay-button"
              >
                {busy === 'pay' ? t('paying') : t('pay', { amount: formatMoney(b.price!, locale) })}
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
            <Icon name="flag" className="size-4" />
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
              {b.payment?.status === 'paid' && refundPreview ? (
                <p className="text-sm text-ink-muted" data-testid="refund-preview">
                  {refundPreview} {pct > 0 || !late ? t('refundTiming') : null}
                </p>
              ) : null}
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

/**
 * The payment receipt: who was paid (the company from the owner's settings, else the brand), the
 * booking reference, amount, date and card. Never shows anything that isn't set.
 */
function Receipt({
  reference,
  amount,
  paidAt,
  card,
}: {
  reference: string;
  amount: string;
  paidAt: string;
  card: string | null;
}) {
  const t = useTranslations('web.booking.receipt');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const company = useCatalog().data?.company;
  const merchant =
    company?.name?.[locale] ?? company?.name?.ar ?? company?.name?.en ?? tc('appName');
  const rows: Array<[string, string, boolean]> = [
    [t('merchant'), merchant, false],
    ...(company?.registrationNo
      ? [[t('registration'), company.registrationNo, true] as [string, string, boolean]]
      : []),
    [t('reference'), reference, true],
    [t('amount'), amount, false],
    [t('paidAt'), paidAt, false],
    ...(card ? [[t('card'), card, true] as [string, string, boolean]] : []),
  ];
  return (
    <details
      className="group rounded-card border border-line bg-surface px-5 py-4 text-sm"
      data-testid="booking-receipt"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Icon name="card" className="size-4 text-primary" />
          {t('title')}
        </span>
        <Icon
          name="chevron"
          className="size-4 rotate-90 text-ink-muted transition-transform group-open:-rotate-90"
        />
      </summary>
      <dl className="mt-3 flex flex-col gap-1.5">
        {rows.map(([label, value, ltr]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="text-end font-medium">{ltr ? <Ltr>{value}</Ltr> : value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-muted">{t('note')}</p>
    </details>
  );
}
