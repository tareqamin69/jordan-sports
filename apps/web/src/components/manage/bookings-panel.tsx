'use client';

import {
  cancelVenueBooking,
  createManualBooking,
  freeStarts,
  getVenueCalendar,
  listVenueBookings,
  updateScheduleSettings,
  type VenueBooking,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  Button,
  Card,
  ListSkeleton,
  Ltr,
  SelectField,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { dmy, displayPhone } from '@/lib/format';
import { joinList, pick } from '@/lib/localized';
import { can, useSetSchedule } from '@/lib/manage';
import { addDays, businessToday, dateForLabel, minutesToTime } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';
import { DateSelect } from './date-select';

const durations = [60, 90, 120, 180];
const weekChoices = [1, 2, 4, 8, 12, 26];

export function BookingsPanel({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.bookings');
  const tc = useTranslations('common');
  const venueId = schedule.venue.id;
  const api = useApi();
  const errorMessage = useErrorMessage();
  const today = businessToday(schedule.venue.timezone, schedule.venue.businessDayStartMinute);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 14));
  const bookings = useQuery({
    queryKey: ['venue-bookings', venueId, from, to],
    queryFn: () => api(listVenueBookings, { params: { venueId }, query: { from, to } }),
    enabled: from <= to,
  });

  const byDate = new Map<string, VenueBooking[]>();
  for (const b of bookings.data?.items ?? []) {
    byDate.set(b.businessDate, [...(byDate.get(b.businessDate) ?? []), b]);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-muted">{t('intro')}</p>
      <div className="grid max-w-md grid-cols-2 gap-3">
        <DateSelect
          from={addDays(today, -30)}
          days={120}
          label={t('from')}
          value={from}
          onChange={(v) => setFrom(v)}
          name="bookingsFrom"
        />
        <DateSelect
          from={addDays(today, -30)}
          days={150}
          label={t('to')}
          value={to}
          onChange={(v) => setTo(v)}
          name="bookingsTo"
        />
      </div>
      {bookings.isPending && from <= to ? (
        <ListSkeleton label={tc('loading')} rows={3} thumb={false} />
      ) : null}
      {bookings.isError ? <Alert tone="error">{errorMessage(bookings.error)}</Alert> : null}
      {bookings.data && bookings.data.items.length === 0 ? (
        <p className="text-ink-muted">{t('empty')}</p>
      ) : null}
      {[...byDate.entries()].map(([date, items]) => (
        <DayGroup key={date} date={date} items={items} schedule={schedule} />
      ))}
      {can(schedule, 'booking.create') ? <ManualBookingForm schedule={schedule} /> : null}
      {can(schedule, 'schedule.rules') ? <CutoffSettings schedule={schedule} /> : null}
    </div>
  );
}

function DayGroup({
  date,
  items,
  schedule,
}: {
  date: string;
  items: VenueBooking[];
  schedule: VenueSchedule;
}) {
  const format = useFormatter();
  return (
    <section>
      <h2 className="mb-3 font-display text-2xl leading-tight">
        {format.dateTime(dateForLabel(date), { weekday: 'long' })} {dmy(date)}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((b) => (
          <BookingRow key={b.id} booking={b} schedule={schedule} />
        ))}
      </ul>
    </section>
  );
}

function BookingRow({ booking: b, schedule }: { booking: VenueBooking; schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.bookings');
  const tb = useTranslations('web.booking');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => api(cancelVenueBooking, { params: { bookingId: b.id }, body: { reason } }),
    meta: { toast: tt('cancelled') },
    onSuccess: async () => {
      setAsking(false);
      await queryClient.invalidateQueries({ queryKey: ['venue-bookings', schedule.venue.id] });
      await queryClient.invalidateQueries({ queryKey: ['calendar', schedule.venue.id] });
    },
  });
  const cancellable = b.status === 'CONFIRMED' && can(schedule, 'booking.cancel');

  return (
    <li
      data-testid="venue-booking"
      className="flex flex-col gap-3 rounded-tile border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-bold">
            <Ltr>
              {b.localStart}–{b.localEnd}
            </Ltr>{' '}
            · {pick(b.resource.name, locale)}
          </p>
          <p className="text-sm">
            {b.customer.name}
            {b.customer.phone ? (
              <>
                {' · '}
                <a href={`tel:${b.customer.phone}`} className="underline">
                  <Ltr>{displayPhone(b.customer.phone)}</Ltr>
                </a>
              </>
            ) : null}
          </p>
          {b.note ? <p className="text-sm text-ink-muted">{b.note}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{b.price ? formatMoney(b.price, locale) : t('noPrice')}</span>
          <Badge>{b.channel === 'MARKETPLACE' ? t('online') : t('byVenue')}</Badge>
          {b.seriesId ? <Badge>{t('weekly')}</Badge> : null}
          <Badge>{tb(`statuses.${b.status}`)}</Badge>
        </div>
      </div>
      {cancel.isError ? <Alert tone="error">{errorMessage(cancel.error)}</Alert> : null}
      {cancellable && !asking ? (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setAsking(true)}
        >
          {t('cancel')}
        </Button>
      ) : null}
      {cancellable && asking ? (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            cancel.mutate();
          }}
        >
          <div className="flex-1">
            <TextField
              label={t('cancelReason')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={3}
              maxLength={300}
              required
              name="cancelReason"
            />
          </div>
          <Button type="submit" variant="danger" busy={cancel.isPending}>
            {t('cancelSubmit')}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

function ManualBookingForm({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.bookings');
  const tm = useTranslations('web.manage');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const bdStart = schedule.venue.businessDayStartMinute;
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const today = businessToday(schedule.venue.timezone, bdStart);
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [offsetChoice, setOffsetChoice] = useState<number | null>(null);
  const [duration, setDuration] = useState(60);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [weeks, setWeeks] = useState(1);
  const now = useNow();
  // Only times inside opening hours that are still free (and not in the past) are offered; the
  // form starts on the first of them (QA #16).
  const calendar = useQuery({
    queryKey: ['calendar', schedule.venue.id, date],
    queryFn: () =>
      api(getVenueCalendar, { params: { venueId: schedule.venue.id }, query: { date } }),
  });
  const day = calendar.data?.resources.find((r) => r.id === resourceId);
  const step = resources.find((r) => r.id === resourceId)?.policy.startAlignmentMinutes ?? 30;
  const notBefore = calendar.data
    ? Math.ceil((now - new Date(calendar.data.dayStart).getTime()) / 60_000)
    : Number.NEGATIVE_INFINITY;
  const offsets = day ? freeStarts(day.open, day.entries, duration, step, notBefore) : [];
  const offset =
    offsetChoice !== null && offsets.includes(offsetChoice) ? offsetChoice : (offsets[0] ?? null);

  const create = useMutation({
    mutationFn: () =>
      api(createManualBooking, {
        params: { venueId: schedule.venue.id },
        body: {
          resourceId,
          date,
          startTime: minutesToTime(bdStart + (offset ?? 0)),
          durationMinutes: duration,
          customer: { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
          ...(note.trim() ? { note: note.trim() } : {}),
          repeatWeeks: weeks,
        },
      }),
    meta: {
      toast: (data) => {
        const n = (data as { created: unknown[] }).created.length;
        return t('added', { count: n, n: String(n) });
      },
    },
    onSuccess: async () => {
      setName('');
      setPhone('');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['venue-bookings', schedule.venue.id] });
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
        <h2 className="font-display text-2xl leading-tight sm:col-span-2 lg:col-span-3">
          {t('newTitle')}
        </h2>
        {create.isError ? (
          <Alert tone="error" className="sm:col-span-2 lg:col-span-3">
            {errorMessage(create.error)}
          </Alert>
        ) : null}
        {create.data && create.data.skipped.length > 0 ? (
          <Alert tone="warning" className="sm:col-span-2 lg:col-span-3">
            {t('skipped', {
              dates: joinList(
                create.data.skipped.map((s) => dmy(s.date)),
                locale,
              ),
            })}
          </Alert>
        ) : null}
        <SelectField
          label={t('resource')}
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          name="manualResource"
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {pick(r.name, locale)}
            </option>
          ))}
        </SelectField>
        <DateSelect
          from={today}
          label={t('date')}
          value={date}
          onChange={(v) => setDate(v)}
          name="manualDate"
        />
        <SelectField
          label={t('start')}
          value={offset ?? ''}
          onChange={(e) => setOffsetChoice(Number(e.target.value))}
          disabled={offsets.length === 0}
          hint={offsets.length === 0 && !calendar.isPending ? t('noFreeTimes') : undefined}
          name="manualStart"
        >
          {offsets.map((o) => (
            <option key={o} value={o}>
              {minutesToTime(bdStart + o)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('duration')}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          name="manualDuration"
        >
          {durations.map((d) => (
            <option key={d} value={d}>
              {tm('minutes', { count: d })}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('customerName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          name="manualName"
        />
        <TextField
          label={t('customerPhone')}
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          name="manualPhone"
        />
        <TextField
          label={t('note')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          name="manualNote"
        />
        <SelectField
          label={t('repeat')}
          value={weeks}
          onChange={(e) => setWeeks(Number(e.target.value))}
          name="manualWeeks"
        >
          {weekChoices.map((w) => (
            <option key={w} value={w}>
              {t('weeks', { count: w, n: String(w) })}
            </option>
          ))}
        </SelectField>
        <div className="flex items-end">
          <Button type="submit" busy={create.isPending} disabled={!resourceId || offset === null}>
            {t('add')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CutoffSettings({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage.bookings');
  const tc = useTranslations('common.actions');
  const api = useApi();
  const setSchedule = useSetSchedule(schedule.venue.id);
  const errorMessage = useErrorMessage();
  const [hours, setHours] = useState(String(schedule.venue.cancellationCutoffHours));
  const [lateRefund, setLateRefund] = useState<0 | 50 | 100>(schedule.venue.lateRefundPercent);
  const save = useMutation({
    mutationFn: () =>
      api(updateScheduleSettings, {
        params: { venueId: schedule.venue.id },
        body: { cancellationCutoffHours: Number(hours), lateRefundPercent: lateRefund },
      }),
    meta: { toast: t('saved') },
    onSuccess: setSchedule,
  });
  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="font-display text-2xl leading-tight">{t('cutoffTitle')}</h2>
        <p className="text-sm text-ink-muted">{t('cutoffHint')}</p>
        {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <TextField
              label={t('cutoffHours')}
              type="number"
              inputMode="numeric"
              min={0}
              max={168}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
              name="cutoffHours"
            />
          </div>
          <div className="w-52">
            <SelectField
              label={t('lateRefund')}
              value={String(lateRefund)}
              onChange={(e) => setLateRefund(Number(e.target.value) as 0 | 50 | 100)}
              name="lateRefundPercent"
            >
              {(['0', '50', '100'] as const).map((p) => (
                <option key={p} value={p}>
                  {t(`lateRefunds.${p}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <Button type="submit" busy={save.isPending}>
            {tc('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
