'use client';

import {
  adminListTransactions,
  adminRetryRefund,
  type Transaction,
} from '@jordan-sports/contracts/web';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  Button,
  Card,
  ListSkeleton,
  Ltr,
  PageHeader,
  SelectField,
  TextField,
  cx,
} from '@jordan-sports/ui';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCan } from '@/lib/admin-session';
import { useApi } from '@/lib/api';
import { dmyTime } from '@/lib/format';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

/** Card brand names as printed on cards. */
const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard' };

type Kind = Transaction['kind'];
type Status = Transaction['status'];

const statusTone: Record<Status, string> = {
  pending: 'bg-accent-300/70 text-ink',
  succeeded: 'bg-brand-100 text-brand-900',
  failed: 'bg-danger/15 text-danger',
};

/** Card gateway transactions: charges and refunds (filter "refunds" for the refunds list). */
export function PaymentsPage() {
  const t = useTranslations('admin.payments');
  const tc = useTranslations('common');
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [kind, setKind] = useState<Kind | ''>('');
  const [status, setStatus] = useState<Status | ''>('');
  const [q, setQ] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['admin-transactions', kind, status, q.trim()],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api(adminListTransactions, {
        query: {
          limit: 50,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(kind ? { kind } : {}),
          ...(status ? { status } : {}),
          ...(q.trim() ? { q: q.trim() } : {}),
        },
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Card className="mb-4">
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <SelectField
            label={t('kind')}
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind | '')}
            name="transactionKind"
          >
            <option value="">{t('all')}</option>
            <option value="charge">{t('kinds.charge')}</option>
            <option value="refund">{t('kinds.refund')}</option>
          </SelectField>
          <SelectField
            label={t('status')}
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | '')}
            name="transactionStatus"
          >
            <option value="">{t('all')}</option>
            {(['pending', 'succeeded', 'failed'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            name="transactionSearch"
            dir="ltr"
          />
        </div>
      </Card>
      {list.isError ? <Alert tone="error">{errorMessage(list.error)}</Alert> : null}
      <Card className="p-0">
        {list.isPending ? (
          <div className="p-4">
            <ListSkeleton label={tc('loading')} rows={5} thumb={false} />
          </div>
        ) : items.length ? (
          <ul className="divide-y divide-line" data-testid="transactions">
            {items.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </ul>
        ) : (
          <p className="p-4 text-ink-muted">{tc('empty')}</p>
        )}
      </Card>
      {list.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            busy={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t('more')}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const t = useTranslations('admin.payments');
  const failures = useTranslations('admin.payments.failures');
  const locale = useLocale();
  const api = useApi();
  const can = useCan();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const retry = useMutation({
    mutationFn: () => api(adminRetryRefund, { params: { transactionId: tx.id } }),
    meta: { toast: t('retried') },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-transactions'] }),
  });

  return (
    <li className="flex flex-col gap-2 p-4" data-testid="transaction">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <Badge className={tx.kind === 'refund' ? 'bg-canvas-deep text-ink' : undefined}>
            {t(`kinds.${tx.kind}`)}
          </Badge>
          <Badge className={statusTone[tx.status]}>{t(`statuses.${tx.status}`)}</Badge>
          <span className="font-medium">
            <Ltr>{tx.bookingReference}</Ltr>
          </span>
          <span className="text-sm text-ink-muted">{pick(tx.venueName, locale)}</span>
        </span>
        <span
          className={cx(
            'text-lg font-bold tabular-nums',
            tx.kind === 'refund' ? 'text-ink' : 'text-primary',
          )}
        >
          {tx.kind === 'refund'
            ? t('minus', { amount: formatMoney(tx.amount, locale) })
            : formatMoney(tx.amount, locale)}
        </span>
      </div>
      <p className="text-xs text-ink-muted">
        {dmyTime(new Date(tx.createdAt))}
        {tx.card ? (
          <>
            {' · '}
            <Ltr>
              {t('card', { brand: BRANDS[tx.card.brand] ?? tx.card.brand, last4: tx.card.last4 })}
            </Ltr>
          </>
        ) : null}
        {tx.reason ? ` · ${t(`reasons.${tx.reason}`)}` : ''}
        {tx.failureCode ? (
          <>
            {' · '}
            {t('failure')}{' '}
            {failures.has(tx.failureCode as never) ? (
              failures(tx.failureCode as never)
            ) : (
              <Ltr>{tx.failureCode}</Ltr>
            )}
          </>
        ) : null}
        {tx.kind === 'refund' && tx.attempts > 1
          ? ` · ${t('attempts', { count: tx.attempts })}`
          : ''}
        {' · '}
        <Ltr>
          {tx.gateway}
          {tx.gatewayRef ? ` ${tx.gatewayRef}` : ''}
        </Ltr>
      </p>
      {retry.isError ? <Alert tone="error">{errorMessage(retry.error)}</Alert> : null}
      {tx.kind === 'refund' && tx.status === 'failed' && can('finance.manage') ? (
        <div>
          <Button
            size="sm"
            variant="secondary"
            busy={retry.isPending}
            onClick={() => retry.mutate()}
          >
            {t('retry')}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
