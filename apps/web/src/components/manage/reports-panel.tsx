'use client';

import { archiveOwnVenue, getVenueStats, type VenueSchedule } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Button,
  Card,
  CountUp,
  SelectField,
  StatsSkeleton,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

/** Venue owner: bookings and their value over a period. */
export function ReportsPanel({ venueId }: { venueId: string }) {
  const t = useTranslations('web.manage.reports');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [days, setDays] = useState(30);
  const stats = useQuery({
    queryKey: ['venue-stats', venueId, days],
    queryFn: () => api(getVenueStats, { params: { venueId }, query: { days } }),
  });
  const b = stats.data?.bookings;
  // Counts count up (CSS); the money value is shown as is.
  const tiles: Array<[string, number | string]> = b
    ? [
        [t('total'), b.total],
        [t('kept'), b.completed + b.confirmed],
        [t('cancelled'), b.cancelled],
        [t('late'), b.lateCancellations],
        [t('noShows'), b.noShows],
        [t('online'), b.online],
        [t('byVenue'), b.byVenue],
        ...(stats.data?.revenue
          ? ([[t('value'), formatMoney(stats.data.revenue, locale)]] as Array<[string, string]>)
          : []),
      ]
    : [];
  return (
    <div className="flex flex-col gap-4" data-testid="reports-panel">
      <div className="max-w-xs">
        <SelectField
          label={t('period')}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          name="reportDays"
        >
          {[7, 30, 90, 365].map((d) => (
            <option key={d} value={d}>
              {t('days', { days: d })}
            </option>
          ))}
        </SelectField>
      </div>
      {stats.isError ? <Alert tone="error">{errorMessage(stats.error)}</Alert> : null}
      {stats.isPending ? (
        <StatsSkeleton label={tc('loading')} count={8} className="sm:grid-cols-4" />
      ) : (
        <dl key={days} className="reveal-stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([label, value]) => (
            <Card key={label} className="lift p-4">
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {typeof value === 'number' ? <CountUp value={value} /> : value}
              </dd>
            </Card>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Venue owner: archive the venue (soft delete) by typing its name. */
export function VenueSettingsPanel({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.venueSettings');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const name = pick(schedule.venue.name, locale);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const archive = useMutation({
    mutationFn: () =>
      api(archiveOwnVenue, {
        params: { venueId: schedule.venue.id },
        body: { confirmName: typed, reason },
      }),
    meta: { toast: tc('toast.archived') },
    onSuccess: () => router.replace('/manage'),
  });
  return (
    <Card className="border border-danger/40" data-testid="venue-settings">
      <h2 className="mb-2 font-display text-2xl">{t('archiveTitle')}</h2>
      <p className="mb-4 text-sm text-ink-muted">{t('archiveExplain', { name })}</p>
      {archive.isError ? (
        <Alert tone="error" className="mb-3">
          {errorMessage(archive.error)}
        </Alert>
      ) : null}
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <TextField
          label={t('typeName')}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          name="archiveConfirm"
        />
        <TextField
          label={t('reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          name="archiveReason"
        />
        <Button
          variant="danger"
          disabled={!typed.trim() || reason.trim().length < 3}
          busy={archive.isPending}
          onClick={() => archive.mutate()}
        >
          {t('archive')}
        </Button>
      </div>
    </Card>
  );
}
