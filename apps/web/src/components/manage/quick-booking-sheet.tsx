'use client';

import { createManualBooking, type VenueSchedule } from '@jordan-sports/contracts';
import { Alert, Button, SelectField, TextField } from '@jordan-sports/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { minutesToTime } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

const WEEKS = [1, 2, 4, 8, 12];

/** Bottom sheet to add a phone / walk-in booking at a tapped calendar time (mobile-first). */
export function QuickBookingSheet({
  schedule,
  date,
  resourceId,
  offset,
  onClose,
}: {
  schedule: VenueSchedule;
  date: string;
  resourceId: string;
  offset: number;
  onClose: () => void;
}) {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common.actions');
  const locale = useLocale();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const dialog = useRef<HTMLDialogElement>(null);
  const resource = schedule.resources.find((r) => r.id === resourceId);
  const durations = [...new Set([...(resource?.policy.slotDurations ?? []), 60, 90, 120])].sort(
    (a, b) => a - b,
  );
  const startTime = minutesToTime(schedule.venue.businessDayStartMinute + offset);
  const [duration, setDuration] = useState(resource?.policy.slotDurations[0] ?? 60);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [weeks, setWeeks] = useState(1);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const create = useMutation({
    mutationFn: () =>
      api(createManualBooking, {
        params: { venueId: schedule.venue.id },
        body: {
          resourceId,
          date,
          startTime,
          durationMinutes: duration,
          customer: { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) },
          repeatWeeks: weeks,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar', schedule.venue.id] });
      await queryClient.invalidateQueries({ queryKey: ['venue-bookings', schedule.venue.id] });
      onClose();
    },
  });

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="quick-booking-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-card bg-surface p-0 text-ink shadow-float backdrop:bg-night/50 sm:m-auto sm:max-w-md sm:rounded-card"
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <h2 id="quick-booking-title" className="font-display text-2xl leading-tight">
            {t('calendar.newBookingTitle', { time: startTime })}
          </h2>
          <p className="text-sm text-ink-muted">{pick(resource?.name, locale)}</p>
        </div>
        {create.isError ? <Alert tone="error">{errorMessage(create.error)}</Alert> : null}
        <TextField
          label={t('bookings.customerName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          autoFocus
          name="quickName"
        />
        <TextField
          label={t('bookings.customerPhone')}
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          name="quickPhone"
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label={t('bookings.duration')}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            name="quickDuration"
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {t('minutes', { count: d })}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('bookings.repeat')}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            name="quickWeeks"
          >
            {WEEKS.map((w) => (
              <option key={w} value={w}>
                {t('bookings.weeks', { count: w, n: String(w) })}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="flex gap-3">
          <Button type="submit" className="flex-1" busy={create.isPending}>
            {t('bookings.add')}
          </Button>
          <Button variant="secondary" onClick={() => dialog.current?.close()}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
