'use client';

import {
  confirmVenuePayment,
  listVenuePayments,
  markPaymentRefunded,
  rejectVenuePayment,
  type VenueBooking,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Button, Card, Ltr, Spinner, TextField } from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { dateInZone, dmy, timeInZone } from '@/lib/format';
import { pick } from '@/lib/localized';
import { can } from '@/lib/manage';
import { useErrorMessage } from '@/lib/use-error-message';

const REFUND_OVERDUE_MS = 48 * 3_600_000;

function When({ iso, zone }: { iso: string; zone: string }) {
  const d = new Date(iso);
  return (
    <Ltr>
      {dmy(dateInZone(d, zone))} {timeInZone(d, zone)}
    </Ltr>
  );
}

function PaymentRow({
  booking,
  zone,
  children,
}: {
  booking: VenueBooking;
  zone: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('web.manage.payments');
  const locale = useLocale();
  const p = booking.payment!;
  return (
    <li className="flex flex-col gap-3 py-4" data-testid="payment-row">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">{booking.customer.name ?? '—'}</span>
          <span className="text-sm text-ink-muted">
            {pick(booking.resource.name, locale)} · <Ltr>{dmy(booking.businessDate)}</Ltr>{' '}
            <Ltr>
              {booking.localStart}–{booking.localEnd}
            </Ltr>
          </span>
          {booking.customer.phone ? (
            <a className="text-sm text-primary" href={`tel:${booking.customer.phone}`}>
              <Ltr>{booking.customer.phone}</Ltr>
            </a>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-lg font-bold text-primary">{formatMoney(p.amount, locale)}</span>
          {p.reference ? (
            <span className="text-sm">
              {t('reference')}:{' '}
              <span className="font-mono font-semibold">
                <Ltr>{p.reference}</Ltr>
              </span>
            </span>
          ) : null}
          {p.submittedAt ? (
            <span className="text-xs text-ink-muted">
              <When iso={p.submittedAt} zone={zone} />
            </span>
          ) : null}
        </div>
      </div>
      {children}
    </li>
  );
}

/** CliQ transfers to confirm and deposits to refund (plan §4, D2). */
export function PaymentsPanel({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.payments');
  const tc = useTranslations('common');
  const venueId = schedule.venue.id;
  const zone = schedule.venue.timezone;
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const editable = can(schedule, 'payments.manage');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  // Page-visit time is precise enough to flag refunds past 48 hours.
  const [now] = useState(() => Date.now());

  const payments = useQuery({
    queryKey: ['venue-payments', venueId],
    queryFn: () => api(listVenuePayments, { params: { venueId } }),
    // New transfers show up without a reload (no SMS/WhatsApp channel yet: plan §4).
    refetchInterval: 20_000,
  });

  const done = (message: string) => {
    setNotice(message);
    setRejecting(null);
    setReason('');
    void queryClient.invalidateQueries({ queryKey: ['venue-payments', venueId] });
    void queryClient.invalidateQueries({ queryKey: ['venue-balance', venueId] });
    void queryClient.invalidateQueries({ queryKey: ['venue-bookings', venueId] });
  };

  const confirm = useMutation({
    mutationFn: (paymentId: string) => api(confirmVenuePayment, { params: { paymentId } }),
    onSuccess: () => done(t('confirmedDone')),
  });
  const reject = useMutation({
    mutationFn: (v: { paymentId: string; reason: string }) =>
      api(rejectVenuePayment, { params: { paymentId: v.paymentId }, body: { reason: v.reason } }),
    onSuccess: () => done(t('rejectedDone')),
  });
  const refunded = useMutation({
    mutationFn: (paymentId: string) => api(markPaymentRefunded, { params: { paymentId } }),
    onSuccess: () => done(t('refundedDone')),
  });
  const failure = confirm.error ?? reject.error ?? refunded.error;

  if (payments.isPending) return <Spinner label={tc('loading')} />;
  if (payments.isError) return <Alert tone="error">{errorMessage(payments.error)}</Alert>;
  const { toConfirm, refundsDue } = payments.data;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-muted">{t('intro')}</p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {failure ? <Alert tone="error">{errorMessage(failure)}</Alert> : null}

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{t('toConfirmTitle')}</h2>
        {toConfirm.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('toConfirmEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {toConfirm.map((b) => (
              <PaymentRow key={b.id} booking={b} zone={zone}>
                {b.holdExpiresAt ? (
                  <p className="text-sm text-clay">
                    {t('deadline')} <When iso={b.holdExpiresAt} zone={zone} />
                  </p>
                ) : null}
                {editable && rejecting === b.payment!.id ? (
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      reject.mutate({ paymentId: b.payment!.id, reason });
                    }}
                  >
                    <TextField
                      label={t('reasonLabel')}
                      name="rejectReason"
                      required
                      minLength={3}
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" variant="danger" busy={reject.isPending}>
                        {t('sendRejection')}
                      </Button>
                      <Button variant="secondary" onClick={() => setRejecting(null)}>
                        {tc('actions.back')}
                      </Button>
                    </div>
                  </form>
                ) : editable ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => confirm.mutate(b.payment!.id)}
                      busy={confirm.isPending && confirm.variables === b.payment!.id}
                    >
                      {t('received')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRejecting(b.payment!.id);
                        setReason(t('reasonDefault'));
                      }}
                    >
                      {t('notReceived')}
                    </Button>
                  </div>
                ) : null}
              </PaymentRow>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{t('refundsTitle')}</h2>
        {refundsDue.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('refundsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {refundsDue.map((b) => {
              const since = b.payment!.refund!.dueSince;
              const overdue = now - new Date(since).getTime() >= REFUND_OVERDUE_MS;
              return (
                <PaymentRow key={b.id} booking={b} zone={zone}>
                  <p
                    className={
                      overdue ? 'text-sm font-medium text-danger' : 'text-sm text-ink-muted'
                    }
                  >
                    {overdue ? t('overdue') : null} {t('refundSince')}{' '}
                    <When iso={since} zone={zone} />
                  </p>
                  {editable ? (
                    <Button
                      className="self-start"
                      onClick={() => refunded.mutate(b.payment!.id)}
                      busy={refunded.isPending && refunded.variables === b.payment!.id}
                    >
                      {t('markRefunded')}
                    </Button>
                  ) : null}
                </PaymentRow>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
