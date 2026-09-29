'use client';

import { setBookingPolicy, type BookingPolicy, type VenueSchedule } from '@jordan-sports/contracts';
import { Alert, Button, Card, CheckboxField, SelectField } from '@jordan-sports/ui';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { can, useSetSchedule } from '@/lib/manage';
import { useErrorMessage } from '@/lib/use-error-message';

const DURATIONS = [30, 45, 60, 90, 120, 150, 180];
const LEADS = [0, 30, 60, 120, 180, 360, 720, 1440];
const ADVANCE = [1, 3, 7, 14, 21, 30, 60, 90];
const BUFFERS = [0, 5, 10, 15, 30];

export function RulesEditor({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common.actions');
  const locale = useLocale();
  const api = useApi();
  const setSchedule = useSetSchedule(schedule.venue.id);
  const errorMessage = useErrorMessage();
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '');
  const [policy, setPolicy] = useState<BookingPolicy>(() => resources[0]!.policy);
  const editable = can(schedule, 'schedule.rules');
  const save = useMutation({
    mutationFn: () => api(setBookingPolicy, { params: { resourceId }, body: policy }),
    meta: { toast: t('rules.saved') },
    onSuccess: setSchedule,
  });
  const set = <K extends keyof BookingPolicy>(key: K, value: BookingPolicy[K]) =>
    setPolicy((p) => ({ ...p, [key]: value }));
  const minutes = (m: number) =>
    m >= 60 && m % 60 === 0 ? t('hoursShort', { count: m / 60 }) : t('minutes', { count: m });

  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('calendar.resource')}
          value={resourceId}
          onChange={(e) => {
            setResourceId(e.target.value);
            setPolicy(resources.find((r) => r.id === e.target.value)!.policy);
            save.reset();
          }}
          name="rulesResource"
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {pick(r.name, locale)}
            </option>
          ))}
        </SelectField>
        <div className="hidden sm:block" />
        {save.isError ? (
          <Alert tone="error" className="sm:col-span-2">
            {errorMessage(save.error)}
          </Alert>
        ) : null}
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t('rules.durations')}</legend>
          <div className="flex flex-wrap gap-4">
            {DURATIONS.map((d) => (
              <CheckboxField
                key={d}
                label={minutes(d)}
                disabled={!editable}
                checked={policy.slotDurations.includes(d)}
                onChange={(e) =>
                  set(
                    'slotDurations',
                    e.target.checked
                      ? [...policy.slotDurations, d].sort((a, b) => a - b)
                      : policy.slotDurations.filter((x) => x !== d),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <SelectField
          label={t('rules.alignment')}
          value={policy.startAlignmentMinutes}
          disabled={!editable}
          onChange={(e) => set('startAlignmentMinutes', Number(e.target.value) as 15 | 30 | 60)}
        >
          {[15, 30, 60].map((m) => (
            <option key={m} value={m}>
              {minutes(m)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('rules.lead')}
          value={policy.minLeadMinutes}
          disabled={!editable}
          onChange={(e) => set('minLeadMinutes', Number(e.target.value))}
        >
          {LEADS.map((m) => (
            <option key={m} value={m}>
              {minutes(m)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('rules.advance')}
          value={policy.maxAdvanceDays}
          disabled={!editable}
          onChange={(e) => set('maxAdvanceDays', Number(e.target.value))}
        >
          {[...new Set([...ADVANCE, policy.maxAdvanceDays])]
            .sort((a, b) => a - b)
            .map((d) => (
              <option key={d} value={d}>
                {t('daysShort', { count: d })}
              </option>
            ))}
        </SelectField>
        <SelectField
          label={t('rules.bufferBefore')}
          value={policy.bufferBeforeMinutes}
          disabled={!editable}
          onChange={(e) => set('bufferBeforeMinutes', Number(e.target.value))}
        >
          {BUFFERS.map((m) => (
            <option key={m} value={m}>
              {minutes(m)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('rules.bufferAfter')}
          value={policy.bufferAfterMinutes}
          disabled={!editable}
          onChange={(e) => set('bufferAfterMinutes', Number(e.target.value))}
        >
          {BUFFERS.map((m) => (
            <option key={m} value={m}>
              {minutes(m)}
            </option>
          ))}
        </SelectField>
        {editable ? (
          <div className="sm:col-span-2">
            <Button
              onClick={() => save.mutate()}
              busy={save.isPending}
              disabled={policy.slotDurations.length === 0}
            >
              {tc('save')}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
