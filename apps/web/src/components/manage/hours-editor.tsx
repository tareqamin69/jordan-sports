'use client';

import { setWeeklyHours, type VenueSchedule, type WeeklyWindow } from '@jordan-sports/contracts';
import { Alert, Button, Card, CheckboxField, SelectField } from '@jordan-sports/ui';
import { useMutation } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { can, useSetSchedule } from '@/lib/manage';
import { isoWeekdayDate, minutesToTime, weekdaysInDisplayOrder } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

interface DayHours {
  open: boolean;
  from: number;
  /** Minutes after the opening day's midnight; ≥ 1440 means after midnight. */
  to: number;
}

type Week = Record<number, DayHours>;

function toWeek(windows: readonly WeeklyWindow[]): Week {
  const week: Week = {};
  for (const day of weekdaysInDisplayOrder) {
    const w = windows.find((x) => x.dayOfWeek === day);
    week[day] = w
      ? { open: true, from: w.startMinute, to: w.startMinute + w.durationMinutes }
      : { open: false, from: 16 * 60, to: 24 * 60 };
  }
  return week;
}

function toWindows(week: Week): WeeklyWindow[] {
  return weekdaysInDisplayOrder
    .filter((d) => week[d]!.open && week[d]!.to > week[d]!.from)
    .map((d) => ({
      dayOfWeek: d,
      startMinute: week[d]!.from,
      durationMinutes: week[d]!.to - week[d]!.from,
    }));
}

const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);

/** Weekly opening hours per resource (one opening window per day in this editor). */
export function HoursEditor({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common.actions');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const setSchedule = useSetSchedule(schedule.venue.id);
  const errorMessage = useErrorMessage();
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '');
  const resource = resources.find((r) => r.id === resourceId);
  const [week, setWeek] = useState<Week>(() => toWeek(resource?.weeklyHours ?? []));
  const editable = can(schedule, 'schedule.hours');

  const save = useMutation({
    mutationFn: async (targets: string[]) => {
      let latest = schedule;
      for (const id of targets) {
        latest = await api(setWeeklyHours, {
          params: { resourceId: id },
          body: { windows: toWindows(week) },
        });
      }
      return latest;
    },
    meta: { toast: t('hours.saved') },
    onSuccess: setSchedule,
  });

  const update = (day: number, patch: Partial<DayHours>) =>
    setWeek((w) => ({ ...w, [day]: { ...w[day]!, ...patch } }));

  const copyToAllDays = (day: number) => {
    const source = week[day]!;
    setWeek((w) => {
      const next: Week = { ...w };
      for (const d of weekdaysInDisplayOrder) next[d] = { ...source };
      return next;
    });
  };

  return (
    <Card>
      <p className="mb-4 text-sm text-ink-muted">{t('hours.intro')}</p>
      <div className="mb-5 max-w-sm">
        <SelectField
          label={t('calendar.resource')}
          value={resourceId}
          onChange={(e) => {
            setResourceId(e.target.value);
            setWeek(toWeek(resources.find((r) => r.id === e.target.value)?.weeklyHours ?? []));
            save.reset();
          }}
          name="hoursResource"
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {pick(r.name, locale)}
            </option>
          ))}
        </SelectField>
      </div>
      {save.isError ? (
        <Alert tone="error" className="mb-4">
          {errorMessage(save.error)}
        </Alert>
      ) : null}
      <ul className="divide-y divide-line">
        {weekdaysInDisplayOrder.map((day) => {
          const h = week[day]!;
          return (
            <li
              key={day}
              className="grid grid-cols-2 items-end gap-3 py-3 sm:grid-cols-[10rem_1fr_1fr_auto]"
              data-testid={`hours-day-${day}`}
            >
              {/* Phones: the day on its own row, then "from" and "to" side by side. */}
              <div className="col-span-2 sm:col-span-1">
                <CheckboxField
                  label={format.dateTime(isoWeekdayDate(day), { weekday: 'long', timeZone: 'UTC' })}
                  checked={h.open}
                  disabled={!editable}
                  onChange={(e) => update(day, { open: e.target.checked })}
                />
              </div>
              {h.open ? (
                <>
                  <SelectField
                    label={t('hours.from')}
                    value={h.from}
                    disabled={!editable}
                    onChange={(e) => {
                      const from = Number(e.target.value);
                      update(day, { from, to: Math.max(h.to, from + 30) });
                    }}
                    name={`from-${day}`}
                  >
                    {HALF_HOURS.map((m) => (
                      <option key={m} value={m}>
                        {minutesToTime(m)}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label={t('hours.to')}
                    value={h.to}
                    disabled={!editable}
                    onChange={(e) => update(day, { to: Number(e.target.value) })}
                    name={`to-${day}`}
                  >
                    {HALF_HOURS.map((m) => h.from + 30 + m)
                      .filter((m) => m <= h.from + 1440)
                      .map((m) => (
                        <option key={m} value={m}>
                          {m >= 1440
                            ? `${minutesToTime(m)} ${t('hours.nextDay')}`
                            : minutesToTime(m)}
                        </option>
                      ))}
                  </SelectField>
                  {editable ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="col-span-2 justify-self-start whitespace-nowrap sm:col-span-1"
                      onClick={() => copyToAllDays(day)}
                    >
                      {t('hours.copyToAllDays')}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      {editable ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={() => save.mutate([resourceId])}
            busy={save.isPending && save.variables?.length === 1}
          >
            {tc('save')}
          </Button>
          {resources.length > 1 ? (
            <Button
              variant="secondary"
              onClick={() => save.mutate(resources.map((r) => r.id))}
              busy={save.isPending && (save.variables?.length ?? 0) > 1}
            >
              {t('hours.copyToAll')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
