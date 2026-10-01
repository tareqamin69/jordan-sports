'use client';

import {
  createOverride,
  deleteOverride,
  updateScheduleSettings,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import { Alert, Button, Card, CheckboxField, SelectField, TextField } from '@jordan-sports/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { dmy } from '@/lib/format';
import { pick } from '@/lib/localized';
import { can, useSetSchedule } from '@/lib/manage';
import { businessToday, minutesToTime } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';
import { DateSelect } from './date-select';

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);

export function ClosuresEditor({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage');
  const tt = useTranslations('common.toast');
  const locale = useLocale();
  const api = useApi();
  const setSchedule = useSetSchedule(schedule.venue.id);
  const errorMessage = useErrorMessage();
  const editable = can(schedule, 'schedule.closures');
  const today = businessToday(schedule.venue.timezone, schedule.venue.businessDayStartMinute);
  const [form, setForm] = useState({
    resourceId: '',
    dateFrom: today,
    dateTo: today,
    kind: 'closed' as 'closed' | 'hours',
    from: 20 * 60,
    to: 26 * 60,
    note: '',
  });

  const add = useMutation({
    mutationFn: () =>
      api(createOverride, {
        params: { venueId: schedule.venue.id },
        body: {
          resourceId: form.resourceId || null,
          dateFrom: form.dateFrom,
          dateTo: form.dateTo,
          kind: form.kind,
          windows:
            form.kind === 'hours'
              ? [{ startMinute: form.from, durationMinutes: form.to - form.from }]
              : [],
          ...(form.note.trim() ? { note: form.note.trim() } : {}),
        },
      }),
    meta: { toast: tt('added') },
    onSuccess: setSchedule,
  });
  const remove = useMutation({
    mutationFn: (overrideId: string) => api(deleteOverride, { params: { overrideId } }),
    meta: { toast: tt('removed') },
    onSuccess: setSchedule,
  });
  const holidays = useMutation({
    mutationFn: (closedOnPublicHolidays: boolean) =>
      api(updateScheduleSettings, {
        params: { venueId: schedule.venue.id },
        body: { closedOnPublicHolidays },
      }),
    meta: { toast: tt('saved') },
    onSuccess: setSchedule,
  });
  const error = add.error ?? remove.error ?? holidays.error;
  const date = (d: string) => dmy(d);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="text-sm text-ink-muted">{t('closures.intro')}</p>
        {error ? (
          <Alert tone="error" className="mt-3">
            {errorMessage(error)}
          </Alert>
        ) : null}
        <CheckboxField
          className="mt-4"
          label={t('closures.holidays')}
          checked={schedule.venue.closedOnPublicHolidays}
          disabled={!editable || holidays.isPending}
          onChange={(e) => holidays.mutate(e.target.checked)}
        />
        {schedule.overrides.length === 0 ? (
          <p className="mt-4 text-ink-muted">{t('closures.empty')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line" data-testid="override-list">
            {schedule.overrides.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {date(o.dateFrom)}
                    {o.dateTo !== o.dateFrom ? ` – ${date(o.dateTo)}` : ''}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {o.resourceId
                      ? pick(schedule.resources.find((r) => r.id === o.resourceId)?.name, locale)
                      : t('closures.wholeVenue')}
                    {' · '}
                    {o.kind === 'closed'
                      ? t('closures.closed')
                      : `${t('closures.specialHours')} ${o.windows.map((w) => `${minutesToTime(w.startMinute)}–${minutesToTime(w.startMinute + w.durationMinutes)}`).join(', ')}`}
                    {o.note ? ` · ${o.note}` : ''}
                  </p>
                </div>
                {editable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate(o.id)}
                    busy={remove.isPending && remove.variables === o.id}
                  >
                    {t('closures.remove')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editable ? (
        <Card>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <SelectField
              label={t('closures.scope')}
              value={form.resourceId}
              onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}
              name="overrideScope"
            >
              <option value="">{t('closures.wholeVenue')}</option>
              {schedule.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {pick(r.name, locale)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('closures.type')}
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({ ...f, kind: e.target.value as 'closed' | 'hours' }))
              }
              name="overrideKind"
            >
              <option value="closed">{t('closures.closed')}</option>
              <option value="hours">{t('closures.specialHours')}</option>
            </SelectField>
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <DateSelect
                from={today}
                label={t('closures.from')}
                value={form.dateFrom}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    dateFrom: v,
                    dateTo: v > f.dateTo ? v : f.dateTo,
                  }))
                }
                name="overrideFrom"
              />
              <DateSelect
                from={form.dateFrom}
                label={t('closures.to')}
                value={form.dateTo}
                onChange={(v) => setForm((f) => ({ ...f, dateTo: v }))}
                name="overrideTo"
              />
            </div>
            {form.kind === 'hours' ? (
              <>
                <SelectField
                  label={t('hours.from')}
                  value={form.from}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      from: Number(e.target.value),
                      to: Math.max(f.to, Number(e.target.value) + 30),
                    }))
                  }
                >
                  {HALF_HOURS.map((m) => (
                    <option key={m} value={m}>
                      {minutesToTime(m)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label={t('hours.to')}
                  value={form.to}
                  onChange={(e) => setForm((f) => ({ ...f, to: Number(e.target.value) }))}
                >
                  {HALF_HOURS.map((m) => form.from + 30 + m)
                    .filter((m) => m <= form.from + 1440)
                    .map((m) => (
                      <option key={m} value={m}>
                        {m >= 1440 ? `${minutesToTime(m)} ${t('hours.nextDay')}` : minutesToTime(m)}
                      </option>
                    ))}
                </SelectField>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <TextField
                label={t('closures.note')}
                value={form.note}
                maxLength={300}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                name="overrideNote"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" busy={add.isPending}>
                {t('closures.add')}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
