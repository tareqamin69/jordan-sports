'use client';

import { submitPaymentProof, type Booking, type BookingPayment } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Button, Card, Ltr, TextField, cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useApi } from '@/lib/api';
import { fieldErrors } from '@/lib/field-errors';
import { useErrorMessage } from '@/lib/use-error-message';
import { Icon } from './icons';

/** "m:ss" with Western digits. */
function remaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function CopyAlias({ alias }: { alias: string }) {
  const t = useTranslations('web.booking.cliq');
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(alias).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors hover:border-line-strong"
    >
      <Icon name={copied ? 'check' : 'share'} className="size-4" />
      {copied ? t('copied') : t('copy')}
    </button>
  );
}

/**
 * Checkout for a CliQ venue (plan §4): the deposit is transferred straight to the venue's alias,
 * then the player sends the transfer reference and waits for the venue to confirm it arrived.
 */
export function CliqCheckout({
  booking,
  payment,
  holdLeft,
  freeUntilText,
  late,
  onUpdate,
  onRelease,
  releasing,
}: {
  booking: Booking;
  payment: BookingPayment;
  holdLeft: number;
  freeUntilText: string;
  late: boolean;
  onUpdate: (next: Booking) => void;
  onRelease: () => void;
  releasing: boolean;
}) {
  const t = useTranslations('web.booking');
  const tq = useTranslations('web.booking.cliq');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // One key per page visit: a retried submission is recognized by the server.
  const key = useMemo(() => crypto.randomUUID(), []);
  const fieldError = fieldErrors(error);
  const referenceError = fieldError('reference');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onUpdate(
        await api(submitPaymentProof, {
          params: { bookingId: booking.id },
          body: { reference },
          idempotencyKey: `${key}:${reference.trim()}`,
        }),
      );
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const countdown = (
    <span
      data-testid="hold-countdown"
      className="flex h-10 w-fit items-center gap-1.5 rounded-full bg-accent-300/60 px-4 text-sm font-medium text-ink"
    >
      <Icon name="clock" className="size-4 text-clay" />
      {payment.status === 'SUBMITTED'
        ? tq('awaitingCountdown', { time: remaining(holdLeft) })
        : t('countdown', { time: remaining(holdLeft) })}
    </span>
  );

  if (payment.status === 'SUBMITTED') {
    return (
      <Card className="flex flex-col gap-4 p-5" data-testid="cliq-awaiting">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-300/60 text-ink">
            <Icon name="clock" className="size-5" />
          </span>
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-semibold text-ink">{tq('awaitingTitle')}</p>
            <p className="leading-7 text-ink-muted">
              {tq('awaitingBody', { reference: payment.reference ?? '' })}
            </p>
          </div>
        </div>
        {countdown}
      </Card>
    );
  }

  const fullNow = payment.remainder.amount <= 0;
  return (
    <Card className="flex flex-col gap-5 p-5" data-testid="cliq-checkout">
      {payment.rejectReason ? (
        <Alert tone="warning">{tq('rejected', { reason: payment.rejectReason })}</Alert>
      ) : null}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">{tq('dueNow')}</p>
        <p className="font-display text-[2rem] leading-tight text-primary" data-testid="cliq-due">
          {formatMoney(payment.amount, locale)}
        </p>
        <p className="text-sm text-ink-muted">
          {fullNow
            ? tq('fullNow')
            : tq('remainder', { amount: formatMoney(payment.remainder, locale) })}
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-canvas p-4">
        <p className="text-sm text-ink-muted">{tq('payTo')}</p>
        <div className="flex items-center justify-between gap-3">
          <span
            className="min-w-0 truncate font-mono text-lg font-semibold"
            data-testid="cliq-alias"
          >
            <Ltr>{payment.payee.alias}</Ltr>
          </span>
          <CopyAlias alias={payment.payee.alias} />
        </div>
        {payment.payee.holderName ? (
          <p className="text-sm text-ink-muted">
            {tq('holder', { name: payment.payee.holderName })}
          </p>
        ) : null}
      </div>

      <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm font-medium leading-7">
        {tq('steps')}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <TextField
          label={tq('referenceLabel')}
          hint={tq('referenceHint')}
          error={referenceError}
          name="cliqReference"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          required
          minLength={4}
          maxLength={40}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        {error && !referenceError ? <Alert tone="error">{errorMessage(error)}</Alert> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" busy={busy} disabled={reference.trim().length < 4}>
            {tq('send')}
          </Button>
          {countdown}
        </div>
      </form>

      <p className={cx('text-sm text-ink-muted', late && 'text-danger')}>
        {late ? tq('termsLate') : tq('terms', { date: freeUntilText })}
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="-ms-2 self-start"
        onClick={onRelease}
        busy={releasing}
      >
        {t('release')}
      </Button>
    </Card>
  );
}

/** One line about the money on a confirmed or cancelled CliQ booking. */
export function CliqPaymentSummary({ booking }: { booking: Booking }) {
  const tq = useTranslations('web.booking.cliq');
  const locale = useLocale();
  const p = booking.payment;
  if (!p) return null;
  const amount = formatMoney(p.amount, locale);
  if (p.refund) {
    return (
      <Alert tone={p.refund.status === 'DUE' ? 'warning' : 'info'}>
        {p.refund.status === 'DUE' ? tq('refundDue', { amount }) : tq('refunded', { amount })}
      </Alert>
    );
  }
  if (booking.status === 'EXPIRED' && p.status === 'EXPIRED' && p.reference) {
    return <Alert tone="warning">{tq('unconfirmed')}</Alert>;
  }
  if (p.status === 'CONFIRMED') {
    return (
      <p className="text-sm text-ink-muted" data-testid="cliq-paid">
        {p.remainder.amount > 0
          ? tq('paid', { amount, remainder: formatMoney(p.remainder, locale) })
          : tq('paidFull', { amount })}
      </p>
    );
  }
  return null;
}
