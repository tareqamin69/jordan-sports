'use client';

import {
  adminArchiveVenue,
  adminGetVenueRating,
  adminGetVenueStats,
  adminRateVenue,
  adminSetVenueCommission,
  venueRatingTags,
  type AdminVenue,
  type VenueRatingTag,
} from '@jordan-sports/contracts/web';
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  ListSkeleton,
  SectionHeading,
  SelectField,
  TextAreaField,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { formatMoney } from '@jordan-sports/money';
import { pick } from '@/lib/localized';
import { useErrorMessage } from '@/lib/use-error-message';

const STAR = '\u2605';

/** Bookings over the last 30 days; revenue only for roles that may see it (server decides). */
export function VenueStatsPanel({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('admin.oversight');
  const tc = useTranslations('common');
  const locale = useLocale();
  const api = useApi();
  const [days, setDays] = useState(30);
  const stats = useQuery({
    queryKey: ['venue-stats', venue.id, days],
    queryFn: () => api(adminGetVenueStats, { params: { venueId: venue.id }, query: { days } }),
  });
  const b = stats.data?.bookings;
  const tiles: Array<[string, number | string]> = b
    ? [
        [t('stats.total'), b.total],
        [t('stats.completed'), b.completed + b.confirmed],
        [t('stats.cancelled'), b.cancelled],
        [t('stats.late'), b.lateCancellations],
        [t('stats.noShows'), b.noShows],
        [t('stats.online'), b.online],
        [t('stats.byVenue'), b.byVenue],
        ...(stats.data?.revenue
          ? ([[t('stats.revenue'), formatMoney(stats.data.revenue, locale)]] as Array<
              [string, string]
            >)
          : []),
      ]
    : [];
  return (
    <Card data-testid="venue-stats">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading title={t('stats.title')} />
        <SelectField
          label={t('stats.period')}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          name="statsDays"
        >
          {[7, 30, 90].map((d) => (
            <option key={d} value={d}>
              {t('stats.days', { days: d })}
            </option>
          ))}
        </SelectField>
      </div>
      {stats.isPending ? (
        <ListSkeleton label={tc('loading')} rows={3} thumb={false} />
      ) : (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-canvas p-3">
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="font-display text-xl tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

/** Owner only: private score, tags and notes, with history. Never shown to anyone else. */
export function VenueRatingPanel({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('admin.oversight');
  const tt = useTranslations('common.toast');
  const tc = useTranslations('common');
  const format = useFormatter();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const key = ['venue-rating', venue.id];
  const rating = useQuery({
    queryKey: key,
    queryFn: () => api(adminGetVenueRating, { params: { venueId: venue.id } }),
  });
  const [score, setScore] = useState(0);
  const [tags, setTags] = useState<VenueRatingTag[]>([]);
  const [note, setNote] = useState('');
  const save = useMutation({
    meta: { toast: tt('saved') },
    mutationFn: () =>
      api(adminRateVenue, {
        params: { venueId: venue.id },
        body: { score, tags, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setScore(0);
      setTags([]);
      setNote('');
    },
  });
  const toggle = (tag: VenueRatingTag) =>
    setTags((ts) => (ts.includes(tag) ? ts.filter((x) => x !== tag) : [...ts, tag]));

  return (
    <Card data-testid="venue-rating">
      <SectionHeading title={t('rating.title')} />
      <p className="mb-4 text-sm text-ink-muted">{t('rating.private')}</p>
      {save.isError ? (
        <Alert tone="error" className="mb-3">
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      {rating.data?.current ? (
        <p className="mb-4" data-testid="rating-current">
          {t('rating.current', { score: rating.data.current.score })}{' '}
          {rating.data.current.tags.map((tag) => t(`rating.tags.${tag}`)).join('، ')}
        </p>
      ) : rating.isPending ? (
        <ListSkeleton label={tc('loading')} rows={3} thumb={false} />
      ) : (
        <p className="mb-4 text-sm text-ink-muted">{t('rating.none')}</p>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (score > 0) save.mutate();
        }}
      >
        <div className="flex gap-1" role="radiogroup" aria-label={t('rating.score')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              aria-label={String(n)}
              onClick={() => setScore(n)}
              className={`size-10 rounded-full text-lg ${n <= score ? 'bg-primary text-canvas' : 'bg-canvas-deep text-ink'}`}
            >
              {STAR}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {venueRatingTags.map((tag) => (
            <CheckboxField
              key={tag}
              label={t(`rating.tags.${tag}`)}
              checked={tags.includes(tag)}
              onChange={() => toggle(tag)}
            />
          ))}
        </div>
        <TextAreaField
          label={t('rating.note')}
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          name="ratingNote"
        />
        <div>
          <Button type="submit" disabled={score === 0} busy={save.isPending}>
            {t('rating.save')}
          </Button>
        </div>
      </form>
      {rating.data && rating.data.history.length > 1 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm">{t('rating.history')}</summary>
          <ul className="mt-2 divide-y divide-line text-sm">
            {rating.data.history.slice(1).map((r) => (
              <li key={r.id} className="py-2">
                {format.dateTime(new Date(r.createdAt), { dateStyle: 'medium' })} ·{' '}
                {t('rating.current', { score: r.score })}{' '}
                {r.tags.map((tag) => t(`rating.tags.${tag}`)).join('، ')}
                {r.note ? <p className="text-ink-muted">{r.note}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

/** Owner only: the venue's own commission rate, or back to the platform default. */
export function VenueCommissionPanel({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('admin.oversight');
  const tt = useTranslations('common.toast');
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [percent, setPercent] = useState(String(venue.commissionBps / 100));
  const [reason, setReason] = useState('');
  const save = useMutation({
    meta: { toast: tt('saved') },
    mutationFn: (commissionBps: number | null) =>
      api(adminSetVenueCommission, {
        params: { venueId: venue.id },
        body: { commissionBps, reason },
      }),
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['venue', venue.id] });
    },
  });
  const value = Number(percent);
  const valid = percent.trim() !== '' && value >= 0 && value <= 50;
  return (
    <Card>
      <SectionHeading title={t('commission.title')} />
      <p className="mb-3 text-sm text-ink-muted">
        {t('commission.current', { percent: venue.commissionBps / 100 })}
      </p>
      {save.isError ? (
        <Alert tone="error" className="mb-3">
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      <div className="grid items-end gap-3 sm:grid-cols-[10rem_1fr_auto_auto]">
        <TextField
          label={t('commission.rate')}
          inputMode="decimal"
          dir="ltr"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          name="venueCommission"
        />
        <TextField
          label={t('reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          name="commissionReason"
        />
        <Button
          disabled={!valid || reason.trim().length < 3}
          busy={save.isPending && save.variables !== null}
          onClick={() => save.mutate(Math.round(value * 100))}
        >
          {t('commission.set')}
        </Button>
        <Button
          variant="secondary"
          disabled={reason.trim().length < 3}
          busy={save.isPending && save.variables === null}
          onClick={() => save.mutate(null)}
        >
          {t('commission.useDefault')}
        </Button>
      </div>
    </Card>
  );
}

/** Owner only: soft delete, confirmed by typing the venue's name. */
export function VenueArchivePanel({ venue }: { venue: AdminVenue }) {
  const t = useTranslations('admin.oversight');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const name = pick(venue.name, locale);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const archive = useMutation({
    meta: { toast: tt('archived') },
    mutationFn: () =>
      api(adminArchiveVenue, {
        params: { venueId: venue.id },
        body: { confirmName: typed, reason },
      }),
    onSuccess: () => router.replace('/venues'),
  });
  return (
    <Card className="border border-danger/40">
      <SectionHeading title={t('archive.title')} />
      <p className="mb-3 text-sm text-ink-muted">{t('archive.explain', { name })}</p>
      {archive.isError ? (
        <Alert tone="error" className="mb-3">
          {errorMessage(archive.error)}
        </Alert>
      ) : null}
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <TextField
          label={t('archive.typeName')}
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
          disabled={typed.trim() === '' || reason.trim().length < 3}
          busy={archive.isPending}
          onClick={() => archive.mutate()}
        >
          {t('archive.confirm')}
        </Button>
      </div>
    </Card>
  );
}
