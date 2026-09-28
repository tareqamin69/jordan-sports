'use client';

import { getVenueBalance, type Balance } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Card, Ltr, Spinner, cx } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/lib/api';
import { dateInZone, dmy, timeInZone } from '@/lib/format';
import { Link } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/use-error-message';

export function useVenueBalance(venueId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: ['venue-balance', venueId],
    queryFn: () => api(getVenueBalance, { params: { venueId } }),
    enabled,
  });
}

/** Low / empty balance and overdue refunds, shown on every dashboard tab (plan §5, D2, D4). */
export function BalanceBanner({ venueId, balance }: { venueId: string; balance: Balance }) {
  const t = useTranslations('web.manage.balance');
  const locale = useLocale();
  if (balance.level === 'ok' && balance.overdueRefunds === 0) return null;
  const tone = balance.takingOnlineBookings ? 'warning' : 'error';
  return (
    <Alert tone={tone} className="mb-6">
      <div className="flex flex-col items-start gap-1">
        {balance.level !== 'ok' ? (
          <span data-testid="balance-banner">
            {t(`levels.${balance.level}`, { amount: formatMoney(balance.balance, locale) })}
          </span>
        ) : null}
        {balance.overdueRefunds > 0 ? (
          <span>{t('overdueRefunds', { count: balance.overdueRefunds })}</span>
        ) : null}
        <Link
          href={{ pathname: `/manage/${venueId}`, query: { tab: 'balance' } }}
          className="text-sm font-semibold underline"
        >
          {t('open')}
        </Link>
      </div>
    </Alert>
  );
}

export function BalancePanel({ venueId, timezone }: { venueId: string; timezone: string }) {
  const t = useTranslations('web.manage.balance');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const balance = useVenueBalance(venueId);
  if (balance.isPending) return <Spinner label={tc('loading')} />;
  if (balance.isError) return <Alert tone="error">{errorMessage(balance.error)}</Alert>;
  const b = balance.data;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-muted">{t('intro')}</p>
      <Card className="flex flex-col gap-2 p-5">
        <p className="text-sm text-ink-muted">{t('current')}</p>
        <p
          data-testid="balance-amount"
          className={cx(
            'font-display text-[2.25rem] leading-tight',
            b.level === 'empty' ? 'text-danger' : 'text-primary',
          )}
        >
          {formatMoney(b.balance, locale)}
        </p>
        <p className="text-sm text-ink-muted">
          {t('threshold', { amount: formatMoney(b.lowBalanceThreshold, locale) })}
        </p>
        <p className="text-sm font-medium">{b.takingOnlineBookings ? t('visible') : t('hidden')}</p>
        <p className="text-sm text-ink-muted">{t('howToTopUp')}</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-lg font-semibold">{t('history')}</h2>
        {b.entries.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('noEntries')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {b.entries.map((e) => {
              const at = new Date(e.createdAt);
              return (
                <li key={e.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{t(`kinds.${e.kind}`)}</span>
                    <span className="text-ink-muted">
                      {e.bookingReference ? (
                        <>
                          {t('booking')} <Ltr>{e.bookingReference}</Ltr> ·{' '}
                        </>
                      ) : null}
                      {e.reason ? `${e.reason} · ` : null}
                      <Ltr>
                        {dmy(dateInZone(at, timezone))} {timeInZone(at, timezone)}
                      </Ltr>
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className={cx(
                        'font-semibold',
                        e.amount.amount < 0 ? 'text-danger' : 'text-primary',
                      )}
                    >
                      <Ltr>
                        {e.amount.amount > 0 ? '+' : ''}
                        {formatMoney(e.amount, locale)}
                      </Ltr>
                    </span>
                    <span className="text-xs text-ink-muted">
                      {formatMoney(e.balanceAfter, locale)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
