'use client';

import {
  cancelBlock,
  createBlock,
  getVenueCalendar,
  type BlockReason,
  type CalendarEntry,
  type VenueSchedule,
} from '@jordan-sports/contracts/web';
import {
  Alert,
  Button,
  Card,
  GridSkeleton,
  SelectField,
  TextField,
  buttonClass,
  cx,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { dmy } from '@/lib/format';
import { pick } from '@/lib/localized';
import { can } from '@/lib/manage';
import { addDays, businessToday, dateForLabel, minutesToTime } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';
import { QuickBookingSheet } from './quick-booking-sheet';

const PX_PER_MINUTE = 1;
const reasons: BlockReason[] = [
  'external_booking',
  'maintenance',
  'private_event',
  'closure',
  'other',
];
const durations = [30, 60, 90, 120, 180, 240];

export function CalendarView({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const venueId = schedule.venue.id;
  const noHoursConfigured = schedule.resources.every((r) => r.weeklyHours.length === 0);
  const today = businessToday(schedule.venue.timezone, schedule.venue.businessDayStartMinute);
  const [date, setDate] = useState(today);
  const key = ['calendar', venueId, date];
  const calendar = useQuery({
    queryKey: key,
    queryFn: () => api(getVenueCalendar, { params: { venueId }, query: { date } }),
  });
  const remove = useMutation({
    mutationFn: (blockId: string) => api(cancelBlock, { params: { blockId } }),
    meta: { toast: tc('toast.removed') },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar', venueId] }),
  });
  const canBlock = can(schedule, 'schedule.block');
  const canBook = can(schedule, 'booking.create');
  const [draft, setDraft] = useState<{ resourceId: string; offset: number } | null>(null);
  const nameOf = (id: string) => pick(schedule.resources.find((r) => r.id === id)?.name, locale);

  const entryLabel = (e: CalendarEntry) => {
    const base =
      e.kind === 'block' && e.reason
        ? t(`calendar.reasons.${e.reason}`)
        : e.kind === 'block'
          ? ''
          : t(`calendar.kinds.${e.kind}`);
    const who = e.customerName ? `${base}: ${e.customerName}` : base;
    return e.note ? `${who} · ${e.note}` : who;
  };

  let span = { from: 16 * 60, to: 24 * 60 };
  if (calendar.data) {
    const ranges = calendar.data.resources.flatMap((r) => [...r.open, ...r.entries]);
    if (ranges.length > 0) {
      span = {
        from: Math.floor(Math.min(...ranges.map((x) => x.offsetMinutes)) / 60) * 60,
        to:
          Math.ceil(Math.max(...ranges.map((x) => x.offsetMinutes + x.durationMinutes)) / 60) * 60,
      };
    }
  }
  const height = (span.to - span.from) * PX_PER_MINUTE;
  const hours = Array.from(
    { length: (span.to - span.from) / 60 + 1 },
    (_, i) => span.from + i * 60,
  );
  const bdStart = schedule.venue.businessDayStartMinute;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDate((d) => addDays(d, -1))}
          aria-label={t('calendar.previous')}
        >
          {t('calendar.previous')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDate(today)}
          disabled={date === today}
        >
          {t('calendar.today')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDate((d) => addDays(d, 1))}
          aria-label={t('calendar.next')}
        >
          {t('calendar.next')}
        </Button>
        <h2 className="ms-2 font-display text-2xl leading-[1.35]" data-testid="calendar-date">
          {format.dateTime(dateForLabel(date), { weekday: 'long' })} {dmy(date)}
        </h2>
      </div>

      {calendar.isPending ? <GridSkeleton label={tc('loading')} columns={4} rows={6} /> : null}
      {calendar.isError ? <Alert tone="error">{errorMessage(calendar.error)}</Alert> : null}
      {remove.isError ? <Alert tone="error">{errorMessage(remove.error)}</Alert> : null}

      {noHoursConfigured ? (
        <Card className="flex flex-col items-start gap-2">
          <p className="font-semibold text-ink">{t('calendar.noHoursTitle')}</p>
          <p className="text-sm text-ink-muted">{t('calendar.noHoursBody')}</p>
          <Link
            href={{ pathname: `/manage/${venueId}`, query: { tab: 'hours' } }}
            className={buttonClass({ size: 'sm', className: 'mt-2' })}
          >
            {t('calendar.noHoursCta')}
          </Link>
        </Card>
      ) : calendar.data ? (
        <Card className="overflow-x-auto p-0">
          <div className="flex min-w-max">
            <div className="sticky start-0 z-10 w-14 shrink-0 border-e border-line bg-surface">
              <div className="h-10 border-b border-line" />
              <div className="relative" style={{ height }}>
                {hours.map((m) => (
                  <span
                    key={m}
                    className="absolute start-1 -translate-y-1/2 text-xs text-ink-muted"
                    style={{ top: (m - span.from) * PX_PER_MINUTE }}
                    dir="ltr"
                  >
                    {minutesToTime(bdStart + m)}
                  </span>
                ))}
              </div>
            </div>
            {calendar.data.resources.map((r) => (
              <div
                key={r.id}
                className="w-40 shrink-0 border-e border-line sm:w-48"
                data-testid="calendar-resource"
              >
                <div className="flex h-10 items-center border-b border-line px-2 text-sm font-bold">
                  {pick(r.name, locale)}
                </div>
                <div className="relative bg-canvas" style={{ height }}>
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute inset-x-0 border-t border-line/70"
                      style={{ top: (m - span.from) * PX_PER_MINUTE }}
                    />
                  ))}
                  {r.open.map((o) => (
                    <div
                      key={o.start}
                      className="absolute inset-x-0 bg-surface"
                      style={{
                        top: (o.offsetMinutes - span.from) * PX_PER_MINUTE,
                        height: o.durationMinutes * PX_PER_MINUTE,
                      }}
                    />
                  ))}
                  {canBook
                    ? r.open.flatMap((o) =>
                        Array.from({ length: Math.floor(o.durationMinutes / 30) }, (_, i) => {
                          const m = o.offsetMinutes + i * 30;
                          const busy = r.entries.some(
                            (e) =>
                              e.offsetMinutes < m + 30 && m < e.offsetMinutes + e.durationMinutes,
                          );
                          if (busy) return null;
                          return (
                            <button
                              key={m}
                              type="button"
                              data-testid="free-cell"
                              onClick={() => setDraft({ resourceId: r.id, offset: m })}
                              aria-label={t('calendar.freeTime', {
                                time: minutesToTime(bdStart + m),
                              })}
                              className="absolute inset-x-1 rounded border border-dashed border-transparent text-xs text-ink-muted hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:bg-brand-50 focus-visible:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-700"
                              style={{
                                top: (m - span.from) * PX_PER_MINUTE + 1,
                                height: 30 * PX_PER_MINUTE - 2,
                              }}
                              dir="ltr"
                            >
                              {['+', minutesToTime(bdStart + m)].join(' ')}
                            </button>
                          );
                        }),
                      )
                    : null}
                  {r.open.length === 0 ? (
                    <p className="absolute inset-x-0 top-2 text-center text-sm text-ink-muted">
                      {t('calendar.closed')}
                    </p>
                  ) : null}
                  {r.entries.map((e) => {
                    const removable =
                      canBlock && e.kind === 'block' && e.blockId && !e.viaResourceId;
                    return (
                      <div
                        key={e.id}
                        data-testid="calendar-entry"
                        className={cx(
                          'absolute inset-x-1 overflow-hidden rounded-xl border px-2 py-1 text-xs',
                          e.viaResourceId
                            ? 'border-line bg-canvas text-ink-muted'
                            : e.kind === 'block'
                              ? 'border-accent-400 bg-accent-300 text-ink'
                              : 'border-primary bg-primary text-on-primary',
                        )}
                        style={{
                          top: (e.offsetMinutes - span.from) * PX_PER_MINUTE + 1,
                          height: Math.max(e.durationMinutes * PX_PER_MINUTE - 2, 18),
                        }}
                      >
                        <p className="font-medium" dir="ltr">
                          {e.localStart}–{e.localEnd}
                        </p>
                        <p>
                          {e.viaResourceId
                            ? t('calendar.viaOther', { name: nameOf(e.viaResourceId) })
                            : entryLabel(e)}
                        </p>
                        {removable ? (
                          <button
                            type="button"
                            className="mt-0.5 inline-flex min-h-6 items-center text-xs font-semibold text-danger underline"
                            onClick={() => {
                              if (window.confirm(t('calendar.confirmRemove')))
                                remove.mutate(e.blockId!);
                            }}
                          >
                            {t('calendar.removeBlock')}
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {canBook ? <p className="-mt-3 text-sm text-ink-muted">{t('calendar.tapHint')}</p> : null}
      {draft ? (
        <QuickBookingSheet
          schedule={schedule}
          date={date}
          resourceId={draft.resourceId}
          offset={draft.offset}
          onClose={() => setDraft(null)}
        />
      ) : null}
      {canBlock ? <BlockForm schedule={schedule} date={date} /> : null}
    </div>
  );
}

function BlockForm({ schedule, date }: { schedule: VenueSchedule; date: string }) {
  const t = useTranslations('web.manage');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const bdStart = schedule.venue.businessDayStartMinute;
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '');
  const [offset, setOffset] = useState(18 * 60 - bdStart);
  const [duration, setDuration] = useState(60);
  const [reason, setReason] = useState<BlockReason>('external_booking');
  const [note, setNote] = useState('');

  // Start times across the business day in 30-minute steps (venue-local labels).
  const offsets = Array.from({ length: 48 }, (_, i) => i * 30);
  const create = useMutation({
    mutationFn: () => {
      const absolute = bdStart + offset;
      return api(createBlock, {
        params: { venueId: schedule.venue.id },
        body: {
          resourceId,
          date: absolute >= 1440 ? addDays(date, 1) : date,
          startTime: minutesToTime(absolute),
          durationMinutes: duration,
          reason,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
    },
    meta: { toast: t('calendar.blocked') },
    onSuccess: async () => {
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['calendar', schedule.venue.id] });
    },
  });

  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="sm:col-span-2 lg:col-span-3">
          <h2 className="font-display text-2xl leading-[1.35]">{t('calendar.blockTitle')}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t('calendar.blockHint')}</p>
        </div>
        {create.isError ? (
          <Alert tone="error" className="sm:col-span-2 lg:col-span-3">
            {errorMessage(create.error)}
          </Alert>
        ) : null}
        <SelectField
          label={t('calendar.resource')}
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          name="blockResource"
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {pick(r.name, locale)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('calendar.start')}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          name="blockStart"
        >
          {offsets.map((o) => (
            <option key={o} value={o}>
              {minutesToTime(bdStart + o)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('calendar.duration')}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          name="blockDuration"
        >
          {durations.map((d) => (
            <option key={d} value={d}>
              {t('minutes', { count: d })}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('calendar.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value as BlockReason)}
          name="blockReason"
        >
          {reasons.map((r) => (
            <option key={r} value={r}>
              {t(`calendar.reasons.${r}`)}
            </option>
          ))}
        </SelectField>
        <div className="sm:col-span-2">
          <TextField
            label={t('calendar.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            name="blockNote"
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" busy={create.isPending}>
            {t('calendar.block')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
