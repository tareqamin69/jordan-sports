'use client';

import {
  cancelVenueBooking,
  createManualBooking,
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
  Ltr,
  SelectField,
  Spinner,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { joinList, pick } from '@/lib/localized';
import { can, useSetSchedule } from '@/lib/manage';
import { addDays, businessToday, dateForLabel, minutesToTime } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

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
  const [to, setTo] = useState(addDays(today, 13));
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
        <TextField
          label={t('from')}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          name="bookingsFrom"
        />
        <TextField
          label={t('to')}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          name="bookingsTo"
        />
      </div>
      {bookings.isPending && from <= to ? <Spinner label={tc('loading')} /> : null}
      {bookings.isError ? <Alert tone="error">{errorMessage(bookings.error)}</Alert> : null}
      {bookings.data && bookings.data.items.length === 0 ? (
        <p className="text-ink-muted">{t('empty')}</p>
      ) : null}
      {[...byDate.entries()].map(([date, items]) => (
        <DayGroup key={date} date={date} items={items} schedule={schedule} />
      ))}
      {can(schedule, 'booking.manage') ? <ManualBookingForm schedule={schedule} /> : null}
      {can(schedule, 'schedule.manage') ? <CutoffSettings schedule={schedule} /> : null}
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
      <h2 className="mb-2 text-lg font-bold">{format.dateTime(dateForLabel(date), 'dayMonth')}</h2>
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
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => api(cancelVenueBooking, { params: { bookingId: b.id }, body: { reason } }),
    onSuccess: async () => {
      setAsking(false);
      await queryClient.invalidateQueries({ queryKey: ['venue-bookings', schedule.venue.id] });
      await queryClient.invalidateQueries({ queryKey: ['calendar', schedule.venue.id] });
    },
  });
  const cancellable = b.status === 'CONFIRMED' && can(schedule, 'booking.manage');

  return (
    <li
      data-testid="venue-booking"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
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
                  <Ltr>{b.customer.phone}</Ltr>
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
  const format = useFormatter();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const bdStart = schedule.venue.businessDayStartMinute;
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const today = businessToday(schedule.venue.timezone, bdStart);
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [offset, setOffset] = useState(18 * 60 - bdStart);
  const [duration, setDuration] = useState(60);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [weeks, setWeeks] = useState(1);
  const offsets = Array.from({ length: 48 }, (_, i) => i * 30);

  const create = useMutation({
    mutationFn: () =>
      api(createManualBooking, {
        params: { venueId: schedule.venue.id },
        body: {
          resourceId,
          date,
          startTime: minutesToTime(bdStart + offset),
          durationMinutes: duration,
          customer: { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
          ...(note.trim() ? { note: note.trim() } : {}),
          repeatWeeks: weeks,
        },
      }),
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
        <h2 className="text-lg font-bold sm:col-span-2 lg:col-span-3">{t('newTitle')}</h2>
        {create.isError ? (
          <Alert tone="error" className="sm:col-span-2 lg:col-span-3">
            {errorMessage(create.error)}
          </Alert>
        ) : null}
        {create.data ? (
          <Alert tone="success" className="sm:col-span-2 lg:col-span-3">
            {t('added', {
              count: create.data.created.length,
              n: String(create.data.created.length),
            })}
            {create.data.skipped.length > 0 ? (
              <span className="block">
                {t('skipped', {
                  dates: joinList(
                    create.data.skipped.map((s) => format.dateTime(dateForLabel(s.date), 'date')),
                    locale,
                  ),
                })}
              </span>
            ) : null}
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
        <TextField
          label={t('date')}
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          required
          name="manualDate"
        />
        <SelectField
          label={t('start')}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
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
              {tm('minutes', { count: String(d) })}
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
          <Button type="submit" busy={create.isPending} disabled={!resourceId}>
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
  const save = useMutation({
    mutationFn: () =>
      api(updateScheduleSettings, {
        params: { venueId: schedule.venue.id },
        body: { cancellationCutoffHours: Number(hours) },
      }),
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
        <h2 className="text-lg font-bold">{t('cutoffTitle')}</h2>
        <p className="text-sm text-ink-muted">{t('cutoffHint')}</p>
        {save.isError ? <Alert tone="error">{errorMessage(save.error)}</Alert> : null}
        {save.isSuccess ? <Alert tone="success">{t('saved')}</Alert> : null}
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
          <Button type="submit" busy={save.isPending}>
            {tc('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
