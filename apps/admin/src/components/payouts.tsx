'use client';

import { adminListPayouts, adminMarkPayoutPaid, type DuePayout } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ListSkeleton,
  Ltr,
  PageHeader,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useCan } from '@/lib/admin-session';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * Weekly venue payouts (ADR-0020): what each venue is owed for bookings played before this week,
 * the bank account to transfer to, and recording the transfer with its bank reference.
 */
export function PayoutsPage() {
  const t = useTranslations('admin.payouts');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const list = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: () => api(adminListPayouts, {}),
  });
  const money = (m: { amount: number; currency: string }) => formatMoney(m, locale);

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {list.isError ? <Alert tone="error">{errorMessage(list.error)}</Alert> : null}
      {list.isPending ? (
        <ListSkeleton label={tc('loading')} rows={3} thumb={false} />
      ) : list.data ? (
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl">{t('dueTitle')}</h2>
            <p className="text-sm text-ink-muted">
              {t('cutoff', {
                date: format.dateTime(new Date(`${list.data.cutoffDate}T12:00:00Z`), {
                  dateStyle: 'medium',
                  numberingSystem: 'latn',
                }),
              })}
            </p>
            {list.data.due.length === 0 ? (
              <EmptyState art="bookings" title={t('dueEmpty')} />
            ) : (
              <ul className="flex flex-col gap-3" data-testid="due-payouts">
                {list.data.due.map((d) => (
                  <DueRow key={d.venueId} due={d} />
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl">{t('paidTitle')}</h2>
            {list.data.paid.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('paidEmpty')}</p>
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-line" data-testid="paid-payouts">
                  {list.data.paid.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4"
                    >
                      <span className="flex flex-col gap-0.5 text-sm">
                        <span className="font-semibold">{pick(p.venueName, locale)}</span>
                        <span className="text-xs text-ink-muted">
                          {format.dateTime(new Date(p.paidAt), {
                            dateStyle: 'medium',
                            numberingSystem: 'latn',
                          })}{' '}
                          · {t('paidLine', { count: p.bookings, last4: p.ibanLast4 })} ·{' '}
                          <Ltr>{p.reference}</Ltr>
                          {p.paidBy ? ` · ${p.paidBy}` : ''}
                        </span>
                      </span>
                      <span className="text-lg font-bold text-primary tabular-nums">
                        {money(p.net)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function DueRow({ due }: { due: DuePayout }) {
  const t = useTranslations('admin.payouts');
  const locale = useLocale();
  const api = useApi();
  const can = useCan();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const money = (m: { amount: number; currency: string }) => formatMoney(m, locale);
  const markPaid = useMutation({
    mutationFn: () =>
      api(adminMarkPayoutPaid, {
        params: { venueId: due.venueId },
        body: { reference, expectedNet: due.net.amount },
      }),
    meta: { toast: t('marked') },
    onSuccess: () => {
      setOpen(false);
      setReference('');
      void queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
    },
  });

  return (
    <li>
      <Card className="flex flex-col gap-3" data-testid="due-payout">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold">{pick(due.venueName, locale)}</span>
            <span className="text-xs text-ink-muted">
              {pick(due.organizationName, locale)} · {t('bookings', { count: due.bookings })}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm tabular-nums">
            <span className="flex flex-col items-end">
              <span className="text-[11px] text-ink-muted">{t('gross')}</span>
              {money(due.gross)}
            </span>
            <span className="flex flex-col items-end text-ink-muted">
              <span className="text-[11px]">{t('commission')}</span>
              {t('minus', { amount: money(due.commission) })}
            </span>
            <span className="flex flex-col items-end text-lg font-bold text-primary">
              <span className="text-[11px] font-normal text-ink-muted">{t('net')}</span>
              {money(due.net)}
            </span>
          </div>
        </div>
        {due.account ? (
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="text-ink-muted">{t('account')}</span>
            <span className="font-mono" data-testid="payout-iban">
              <Ltr>{due.account.iban.replace(/(.{4})/g, '$1 ').trim()}</Ltr>
            </span>
            <span>· {due.account.holderName}</span>
            {due.account.bankName ? <span>· {due.account.bankName}</span> : null}
          </p>
        ) : (
          <div>
            <Badge className="bg-accent-300/70 text-ink">{t('noAccount')}</Badge>
          </div>
        )}
        {markPaid.isError ? <Alert tone="error">{errorMessage(markPaid.error)}</Alert> : null}
        {can('finance.manage') && due.account ? (
          open ? (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                markPaid.mutate();
              }}
            >
              <div className="min-w-56 flex-1">
                <TextField
                  label={t('reference')}
                  hint={t('referenceHint', { amount: money(due.net) })}
                  name="payoutReference"
                  dir="ltr"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  minLength={3}
                  required
                />
              </div>
              <Button type="submit" busy={markPaid.isPending}>
                {t('confirm')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
            </form>
          ) : (
            <div>
              <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
                {t('markPaid')}
              </Button>
            </div>
          )
        ) : null}
      </Card>
    </li>
  );
}
