'use client';

import {
  getPayoutAccount,
  getVenueEarnings,
  setPayoutAccount,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ListSkeleton,
  Ltr,
  StatsSkeleton,
  TextField,
  cx,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { dmy } from '@/lib/format';
import { pick } from '@/lib/localized';
import { can } from '@/lib/manage';
import { useErrorMessage } from '@/lib/use-error-message';
import { Icon } from '../icons';

const statusTone = {
  upcoming: 'bg-canvas-deep text-ink',
  pending: 'bg-accent-300/70 text-ink',
  due: 'bg-brand-100 text-brand-900',
  paid: 'bg-primary text-on-primary',
} as const;

/**
 * "المستحقات": what the venue earned from card bookings (ADR-0020) — per booking paid, Jorena's
 * commission and the venue's share — the weekly transfer schedule and past transfers.
 */
export function EarningsPanel({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.earnings');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const venueId = schedule.venue.id;
  const earnings = useQuery({
    queryKey: ['venue-earnings', venueId],
    queryFn: () => api(getVenueEarnings, { params: { venueId } }),
  });

  if (earnings.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <StatsSkeleton label={tc('loading')} count={4} />
        <ListSkeleton label={tc('loading')} rows={3} thumb={false} />
      </div>
    );
  }
  if (earnings.isError) return <Alert tone="error">{errorMessage(earnings.error)}</Alert>;
  const e = earnings.data;
  const money = (m: { amount: number; currency: string }) => formatMoney(m, locale);
  const commission = `${(e.commissionBps / 100).toLocaleString('en', { maximumFractionDigits: 2 })}%`;
  const tiles = [
    { key: 'due', value: e.totals.due, strong: true },
    { key: 'pending', value: e.totals.pending },
    { key: 'upcoming', value: e.totals.upcoming },
    { key: 'paid', value: e.totals.paid },
  ] as const;

  return (
    <div className="flex flex-col gap-6" data-testid="earnings-panel">
      <div className="flex flex-col gap-1">
        <p className="text-ink-muted">{t('intro', { commission })}</p>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon name="calendar" className="size-4 text-primary" />
          {t('schedule', {
            date: format.dateTime(new Date(`${e.nextPayoutDate}T12:00:00Z`), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              numberingSystem: 'latn',
            }),
          })}
        </p>
      </div>

      <dl className="reveal-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card
            key={tile.key}
            className={cx('flex flex-col gap-1 p-4', 'strong' in tile && 'border-primary')}
          >
            <dt className="text-xs text-ink-muted">{t(tile.key)}</dt>
            <dd
              className={cx(
                'text-xl font-bold tabular-nums',
                'strong' in tile ? 'text-primary' : 'text-ink',
              )}
              data-testid={`earnings-${tile.key}`}
            >
              {money(tile.value)}
            </dd>
          </Card>
        ))}
      </dl>

      <Card className="flex items-center gap-3 p-4 text-sm">
        <Icon name="bank" className="size-5 shrink-0 text-primary" />
        {e.account ? (
          <span>
            {t('account', { iban: '' })}
            <Ltr>{e.account.ibanMasked}</Ltr>
            {e.account.holderName ? ` · ${e.account.holderName}` : null}
          </span>
        ) : (
          <span className="text-ink-muted">{t('noAccount')}</span>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">{t('bookingsTitle')}</h2>
        {e.items.length === 0 ? (
          <EmptyState art="bookings" title={t('empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {e.items.map((i) => (
              <li
                key={i.bookingId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-tile border border-line bg-surface p-4"
                data-testid="earning"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">
                    <Ltr>{dmy(i.businessDate)}</Ltr> · <Ltr>{i.localStart}</Ltr> ·{' '}
                    {pick(i.resourceName, locale)}
                  </span>
                  <span className="text-xs text-ink-muted">
                    <Ltr>{i.reference}</Ltr>
                    {i.refunded.amount > 0
                      ? ` · ${t('refunded', { amount: money(i.refunded) })}`
                      : null}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm tabular-nums">
                  <span className="flex flex-col items-end">
                    <span className="text-[11px] text-ink-muted">{t('gross')}</span>
                    {money(i.gross)}
                  </span>
                  <span className="flex flex-col items-end text-ink-muted">
                    <span className="text-[11px]">{t('commission')}</span>
                    {t('minus', { amount: money(i.commission) })}
                  </span>
                  <span className="flex flex-col items-end font-bold text-primary">
                    <span className="text-[11px] font-normal text-ink-muted">{t('net')}</span>
                    {money(i.net)}
                  </span>
                  <Badge className={statusTone[i.status]}>{t(`statuses.${i.status}`)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">{t('payoutsTitle')}</h2>
        {e.payouts.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('payoutsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-tile border border-line bg-surface">
            {e.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="flex flex-col gap-0.5 text-sm">
                  <span className="font-semibold">
                    {format.dateTime(new Date(p.paidAt), { dateStyle: 'medium' })}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {t('payoutLine', {
                      count: p.bookings,
                      reference: p.reference,
                      last4: p.ibanLast4,
                    })}
                  </span>
                </span>
                <span className="text-lg font-bold text-primary tabular-nums">{money(p.net)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {can(schedule, 'payouts.manage') ? <PayoutAccountCard venueId={venueId} /> : null}
    </div>
  );
}

/** Owner only: the IBAN payouts go to. */
export function PayoutAccountCard({ venueId }: { venueId: string }) {
  const t = useTranslations('web.manage.payoutAccount');
  const tc = useTranslations('common');
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const account = useQuery({
    queryKey: ['payout-account', venueId],
    queryFn: () => api(getPayoutAccount, { params: { venueId } }),
  });
  const [edited, setEdited] = useState<{
    iban: string;
    holderName: string;
    bankName: string;
  } | null>(null);
  const current = account.data?.account;
  const f = edited ?? {
    iban: current?.iban ?? '',
    holderName: current?.holderName ?? '',
    bankName: current?.bankName ?? '',
  };
  const save = useMutation({
    mutationFn: () =>
      api(setPayoutAccount, {
        params: { venueId },
        body: {
          iban: f.iban,
          holderName: f.holderName,
          bankName: f.bankName.trim() ? f.bankName : null,
        },
      }),
    meta: { toast: t('saved') },
    onSuccess: (data) => {
      queryClient.setQueryData(['payout-account', venueId], data);
      void queryClient.invalidateQueries({ queryKey: ['venue-earnings', venueId] });
      setEdited(null);
    },
  });
  if (account.isPending) return <ListSkeleton label={tc('loading')} rows={1} thumb={false} />;
  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="payout-account">
      <div>
        <h2 className="font-display text-2xl">{t('title')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('intro')}</p>
      </div>
      {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(ev: FormEvent) => {
          ev.preventDefault();
          save.mutate();
        }}
      >
        <div className="sm:col-span-2">
          <TextField
            label={t('iban')}
            hint={t('ibanHint')}
            name="iban"
            dir="ltr"
            autoComplete="off"
            placeholder="JO94 CBJO 0010 0000 0000 0131 0003 02"
            value={f.iban}
            onChange={(ev) => setEdited({ ...f, iban: ev.target.value })}
            required
          />
        </div>
        <TextField
          label={t('holder')}
          name="holderName"
          value={f.holderName}
          onChange={(ev) => setEdited({ ...f, holderName: ev.target.value })}
          required
        />
        <TextField
          label={t('bank')}
          name="bankName"
          value={f.bankName}
          onChange={(ev) => setEdited({ ...f, bankName: ev.target.value })}
        />
        <div className="sm:col-span-2">
          <Button type="submit" busy={save.isPending} disabled={edited === null}>
            {t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
