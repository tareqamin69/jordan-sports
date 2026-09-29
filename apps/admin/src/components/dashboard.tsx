'use client';

import { adminReportsOverview, type ReportPeriod } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Card,
  CountUp,
  PageHeader,
  StatsSkeleton,
  TextField,
  chipClass,
} from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { useAdminMe, useCan } from '@/lib/admin-session';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';
import { DailyColumns } from './daily-columns';

const PERIODS: ReportPeriod[] = ['today', 'week', 'month'];
type TileKey =
  | 'online'
  | 'cancellations'
  | 'noShows'
  | 'newUsers'
  | 'newVenues'
  | 'pendingVenues'
  | 'openComplaints'
  | 'bookingValue'
  | 'commission';

/** Owner dashboard (docs/rbac-plan.md §7.1): each role sees the figures it may see. */
export function Dashboard() {
  const t = useTranslations('admin.dashboard');
  const th = useTranslations('admin.home');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const me = useAdminMe();
  const can = useCan();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const overview = useQuery({
    queryKey: ['overview', period],
    queryFn: () => api(adminReportsOverview, { query: { period } }),
    enabled: can('reports.read'),
  });
  const o = overview.data;
  const count = (n: number) => format.number(n);
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  const tiles: Array<{ key: TileKey; value: ReactNode; href?: string }> = o
    ? [
        { key: 'online', value: <CountUp value={o.totals.online} /> },
        { key: 'cancellations', value: <CountUp value={o.totals.cancellations} /> },
        { key: 'noShows', value: <CountUp value={o.totals.noShows} /> },
        { key: 'newUsers', value: <CountUp value={o.totals.newUsers} /> },
        { key: 'newVenues', value: <CountUp value={o.totals.newVenues} /> },
        {
          key: 'pendingVenues',
          value: <CountUp value={o.totals.pendingVenues} />,
          href: '/venues',
        },
        {
          key: 'openComplaints',
          value: <CountUp value={o.totals.openComplaints} />,
          href: '/complaints',
        },
        ...(o.revenue
          ? [
              { key: 'bookingValue' as const, value: formatMoney(o.revenue.bookingValue, locale) },
              { key: 'commission' as const, value: formatMoney(o.revenue.commission, locale) },
            ]
          : []),
      ]
    : [];

  return (
    <>
      <PageHeader
        title={th('title')}
        description={th('welcome', { name: me.data?.displayName ?? me.data?.email ?? '' })}
      />
      <div className="mb-6 flex gap-2" role="group" aria-label={t('period')}>
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            className={chipClass(period === p, { tone: 'night' })}
            onClick={() => setPeriod(p)}
          >
            {t(`periods.${p}`)}
          </button>
        ))}
      </div>
      {overview.isError ? <Alert tone="error">{errorMessage(overview.error)}</Alert> : null}
      {overview.isPending && can('reports.read') ? (
        <StatsSkeleton label={tc('loading')} count={8} />
      ) : null}
      {o ? (
        <div key={period} className="flex animate-rise flex-col gap-6" data-testid="dashboard">
          <Card>
            <p className="text-sm text-ink-muted">{t('bookings')}</p>
            <p
              className="font-sans text-5xl font-semibold tabular-nums"
              data-testid="hero-bookings"
            >
              <CountUp value={o.totals.bookings} />
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {tiles.map((tile) => {
                const body = (
                  <>
                    <dt className="text-xs text-ink-muted">{t(`tiles.${tile.key}`)}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{tile.value}</dd>
                  </>
                );
                return tile.href ? (
                  <Link
                    key={tile.key}
                    href={tile.href}
                    className="lift rounded-lg bg-canvas p-3 hover:bg-canvas-deep"
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={tile.key} className="rounded-lg bg-canvas p-3">
                    {body}
                  </div>
                );
              })}
            </dl>
          </Card>
          <Card>
            <DailyColumns
              title={t('dailyBookings')}
              points={o.daily.map((d) => ({ date: d.date, value: d.bookings }))}
              formatValue={(v) => count(v)}
              formatDate={day}
              tableLabel={t('showTable')}
            />
          </Card>
          {o.revenue ? (
            <Card>
              <DailyColumns
                title={t('dailyValue')}
                points={o.daily.map((d) => ({ date: d.date, value: d.bookingValue ?? 0 }))}
                formatValue={(v) => formatMoney({ amount: Math.round(v), currency: 'JOD' }, locale)}
                formatDate={day}
                tableLabel={t('showTable')}
                minStep={1000}
                formatTick={(v) =>
                  format.number(v / 1000, {
                    style: 'currency',
                    currency: 'JOD',
                    maximumFractionDigits: 0,
                  })
                }
              />
            </Card>
          ) : null}
          <div className="grid gap-6 md:grid-cols-2">
            <RankedList
              title={t('topVenues')}
              empty={tc('empty')}
              items={o.topVenues.map((v) => ({
                key: v.venueId,
                label: pick(v.name, locale),
                value: v.bookings,
                href: `/venues/${v.venueId}`,
              }))}
            />
            <RankedList
              title={t('topAreas')}
              empty={tc('empty')}
              items={o.topAreas.map((a, i) => ({
                key: String(i),
                label: a.area
                  ? `${pick(a.area, locale)}، ${pick(a.governorate, locale)}`
                  : pick(a.governorate, locale),
                value: a.bookings,
              }))}
            />
          </div>
          {can('revenue.read') ? <ExportCard /> : null}
        </div>
      ) : null}
    </>
  );
}

/** Ranked counts with a thin magnitude bar (one hue; text in ink, never the bar color). */
function RankedList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; label: string; value: number; href?: string }>;
}) {
  const format = useFormatter();
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <Card>
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {items.length === 0 ? <p className="text-sm text-ink-muted">{empty}</p> : null}
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.key}>
            <div className="flex justify-between gap-3 text-sm">
              {item.href ? (
                <Link href={item.href} className="-my-2 truncate py-2 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate">{item.label}</span>
              )}
              <span className="tabular-nums">{format.number(item.value)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-canvas-deep">
              <div
                className="h-1.5 rounded-full bg-primary"
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ExportCard() {
  const t = useTranslations('admin.dashboard');
  // Lazy initial state: computed once when the card mounts.
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  return (
    <Card>
      <h2 className="mb-3 text-sm font-medium">{t('export')}</h2>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <TextField
          label={t('from')}
          type="date"
          dir="ltr"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          name="exportFrom"
        />
        <TextField
          label={t('to')}
          type="date"
          dir="ltr"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          name="exportTo"
        />
        <a
          className={chipClass(true, {
            tone: 'night',
            className: valid ? '' : 'pointer-events-none opacity-50',
          })}
          href={`/api/v1/admin/reports/bookings.csv?from=${from}&to=${to}`}
          download
        >
          {t('download')}
        </a>
      </div>
    </Card>
  );
}
