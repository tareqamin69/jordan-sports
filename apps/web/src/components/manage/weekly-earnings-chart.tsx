'use client';

import type { Earning } from '@jordan-sports/contracts/web';
import { formatMoney } from '@jordan-sports/money';
import { cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { dmy } from '@/lib/format';
import { addDays } from '@/lib/time';

const WEEKS = 8;

/** Sunday on or before a YYYY-MM-DD date (payout weeks run Sunday to Saturday). */
function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -day);
}

/**
 * The venue's net earnings per week, last eight weeks, as a column chart (one series, brand
 * green). Time runs in the reading direction; the current week is still open, so it is drawn
 * lighter. Every column has its value in a hover/focus tooltip, and the same numbers are one tap
 * away as a table (DESIGN.md, dataviz rules: one axis, no colour-only meaning).
 */
export function WeeklyEarningsChart({ items, today }: { items: Earning[]; today: string }) {
  const t = useTranslations('web.manage.earnings.chart');
  const locale = useLocale();
  const current = weekStart(today);
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(current, -7 * (WEEKS - 1 - i)));
  const currency = items[0]?.net.currency ?? 'JOD';
  const totals = new Map(weeks.map((w) => [w, 0]));
  for (const item of items) {
    const w = weekStart(item.businessDate);
    if (totals.has(w)) totals.set(w, totals.get(w)! + item.net.amount);
  }
  const values = weeks.map((w) => ({ week: w, amount: totals.get(w)! }));
  const max = Math.max(...values.map((v) => v.amount));
  if (max === 0) return null;
  const money = (amount: number) => formatMoney({ amount, currency }, locale);
  const peak = values.findIndex((v) => v.amount === max);

  return (
    <figure
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5"
      data-testid="weekly-earnings"
    >
      <figcaption className="flex flex-col gap-0.5">
        <span className="font-display text-xl">{t('title')}</span>
        <span className="text-sm text-ink-muted">{t('subtitle')}</span>
      </figcaption>
      <div className="flex h-44 items-end gap-1.5 border-b border-line-strong sm:gap-3" aria-hidden>
        {values.map((v, i) => {
          const open = v.week === current;
          const labelled = i === peak || open;
          return (
            <div
              key={v.week}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
            >
              {labelled && v.amount > 0 ? (
                <span className="mb-1 whitespace-nowrap text-[11px] font-semibold tabular-nums text-ink">
                  {money(v.amount)}
                </span>
              ) : null}
              <span
                className={cx(
                  'w-full max-w-6 origin-bottom animate-grow rounded-t-[4px] transition-opacity',
                  open ? 'bg-brand-300' : 'bg-primary',
                  'group-hover:opacity-80',
                )}
                style={
                  {
                    height: `${v.amount > 0 ? Math.max(3, (v.amount / max) * 100) : 0}%`,
                    '--i': i,
                  } as CSSProperties
                }
              />
              <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-field bg-night px-2.5 py-1.5 text-xs text-canvas shadow-float group-hover:block">
                {t('tooltip', { week: dmy(v.week).slice(0, 5), amount: money(v.amount) })}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 sm:gap-3" aria-hidden>
        {values.map((v) => (
          <span
            key={v.week}
            className="flex-1 text-center text-[10px] tabular-nums text-ink-muted sm:text-xs"
            dir="ltr"
          >
            {dmy(v.week).slice(0, 5)}
          </span>
        ))}
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <span aria-hidden className="h-2.5 w-4 rounded-[3px] bg-brand-300" />
        {t('openWeek')}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-primary">{t('asTable')}</summary>
        <table className="mt-2 w-full text-start tabular-nums">
          <thead>
            <tr className="text-xs text-ink-muted">
              <th className="py-1 text-start font-medium">{t('week')}</th>
              <th className="py-1 text-end font-medium">{t('net')}</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v) => (
              <tr key={v.week} className="border-t border-line">
                <td className="py-1.5">
                  <span dir="ltr">{dmy(v.week)}</span>
                  {v.week === current ? ` (${t('open')})` : ''}
                </td>
                <td className="py-1.5 text-end">{money(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
