'use client';

import { adminAdjustBalance, adminGetBalance } from '@jordan-sports/contracts';
import { formatMoney, parseMajor } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  Button,
  Card,
  Ltr,
  SelectField,
  StatsSkeleton,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { dmyTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

/**
 * Commission balance of an organization, with manual credits/debits (plan §5). Until the venue
 * top-up flow exists, a CliQ top-up received by the platform is credited here.
 */
export function BalanceCard({ organizationId }: { organizationId: string }) {
  const t = useTranslations('admin.balance');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);

  const balance = useQuery({
    queryKey: ['balance', organizationId],
    queryFn: () => api(adminGetBalance, { params: { organizationId } }),
  });
  const adjust = useMutation({
    meta: { toast: t('adjusted') },
    mutationFn: (fils: number) =>
      api(adminAdjustBalance, {
        params: { organizationId },
        body: { amount: direction === 'credit' ? fils : -fils, reason },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['balance', organizationId], data);
      setAmount('');
      setReason('');
    },
  });

  if (balance.isPending)
    return <StatsSkeleton label={tc('loading')} count={2} className="lg:grid-cols-2" />;
  if (balance.isError) return <Alert tone="error">{errorMessage(balance.error)}</Alert>;
  const b = balance.data;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight">{t('title')}</h2>
        <Badge>{t(`levels.${b.level}`)}</Badge>
      </div>
      <p
        data-testid="admin-balance"
        className={`mt-2 font-display text-3xl ${b.level === 'empty' ? 'text-danger' : 'text-primary'}`}
      >
        {formatMoney(b.balance, locale)}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {b.takingOnlineBookings ? t('visible') : t('hidden')}
        {b.overdueRefunds > 0 ? ` · ${t('overdueRefunds', { count: b.overdueRefunds })}` : null}
      </p>

      <form
        className="mt-5 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fils = parseMajor(amount, b.balance.currency);
          if (!fils) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          adjust.mutate(fils);
        }}
      >
        <h3 className="font-semibold">{t('adjust')}</h3>
        {adjust.isError ? <Alert tone="error">{errorMessage(adjust.error)}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t('direction')}
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'credit' | 'debit')}
            name="direction"
          >
            <option value="credit">{t('credit')}</option>
            <option value="debit">{t('debit')}</option>
          </SelectField>
          <TextField
            label={t('amount', { currency: b.balance.currency })}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            required
            name="amount"
            error={invalid ? t('invalidAmount') : undefined}
          />
        </div>
        <TextField
          label={t('reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={300}
          name="reason"
        />
        <Button type="submit" busy={adjust.isPending} className="self-start">
          {t('save')}
        </Button>
      </form>

      <h3 className="mt-6 font-semibold">{t('history')}</h3>
      {b.entries.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{t('noEntries')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line text-sm">
          {b.entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="flex flex-col">
                <span className="font-medium">{t(`kinds.${e.kind}`)}</span>
                <span className="text-ink-muted">
                  {e.bookingReference ? <Ltr>{e.bookingReference} · </Ltr> : null}
                  {e.reason ? `${e.reason} · ` : null}
                  <Ltr>{dmyTime(new Date(e.createdAt))}</Ltr>
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className={e.amount.amount < 0 ? 'text-danger' : 'text-primary'}>
                  <Ltr>
                    {e.amount.amount > 0 ? '+' : ''}
                    {formatMoney(e.amount, locale)}
                  </Ltr>
                </span>
                <span className="text-xs text-ink-muted">
                  {formatMoney(e.balanceAfter, locale)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
