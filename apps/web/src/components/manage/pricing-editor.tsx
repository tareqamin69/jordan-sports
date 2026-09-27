'use client';

import {
  archivePriceRule,
  createPriceRules,
  getVenuePricing,
  previewQuote,
  replacePriceRule,
  type PriceRuleView,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import { formatMoney, parseMajor, toMajorString } from '@jordan-sports/money';
import {
  Alert,
  Badge,
  Button,
  Card,
  CheckboxField,
  SelectField,
  Spinner,
  TextField,
} from '@jordan-sports/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useApi } from '@/lib/api';
import { dmy } from '@/lib/format';
import { joinList, pick } from '@/lib/localized';
import { can } from '@/lib/manage';
import {
  addDays,
  businessToday,
  isoWeekdayDate,
  minutesToTime,
  weekdaysInDisplayOrder,
} from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';
import { DateSelect } from './date-select';

const PRIORITIES = [
  { key: 'low', value: -10 },
  { key: 'normal', value: 0 },
  { key: 'high', value: 10 },
  { key: 'highest', value: 20 },
] as const;

export function PricingEditor({ schedule }: { schedule: VenueSchedule }) {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const venueId = schedule.venue.id;
  const pricing = useQuery({
    queryKey: ['pricing', venueId],
    queryFn: () => api(getVenuePricing, { params: { venueId } }),
  });
  const remove = useMutation({
    mutationFn: (ruleId: string) => api(archivePriceRule, { params: { ruleId } }),
    onSuccess: (data) => queryClient.setQueryData(['pricing', venueId], data),
  });
  const editable = can(schedule, 'pricing.manage');
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const bdStart = schedule.venue.businessDayStartMinute;

  const [editing, setEditing] = useState<BandGroup | null>(null);
  const groups = groupRules(pricing.data?.rules ?? []);
  const allIds = resources.map((r) => r.id);
  const courtsOf = (g: BandGroup) =>
    allIds.every((id) => g.resourceIds.includes(id))
      ? t('pricing.allCourts')
      : joinList(
          resources.filter((r) => g.resourceIds.includes(r.id)).map((r) => pick(r.name, locale)),
          locale,
        );

  const weekday = (d: number) =>
    format.dateTime(isoWeekdayDate(d), { weekday: 'short', timeZone: 'UTC' });
  const describe = (rule: PriceRuleView) => {
    const days =
      rule.daysOfWeek.length === 7
        ? [t('pricing.everyDay')]
        : weekdaysInDisplayOrder.filter((d) => rule.daysOfWeek.includes(d)).map(weekday);
    const band =
      rule.endMinute - rule.startMinute >= 1440
        ? t('pricing.allDay')
        : `${minutesToTime(rule.startMinute)}–${minutesToTime(rule.endMinute)}`;
    const dates =
      rule.dateFrom && rule.dateTo
        ? ` · ${dmy(rule.dateFrom)}${rule.dateTo !== rule.dateFrom ? ` – ${dmy(rule.dateTo)}` : ''}`
        : '';
    return `${joinList(days, locale)} · ${band}${dates}`;
  };

  if (pricing.isPending) return <Spinner label={tc('loading')} />;
  if (pricing.isError) return <Alert tone="error">{errorMessage(pricing.error)}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="text-sm text-ink-muted">{t('pricing.intro')}</p>
        {remove.isError ? (
          <Alert tone="error" className="mt-3">
            {errorMessage(remove.error)}
          </Alert>
        ) : null}
        {pricing.data.rules.length === 0 ? (
          <p className="mt-4 text-ink-muted">{t('pricing.empty')}</p>
        ) : null}
        <ul className="mt-4 divide-y divide-line" data-testid="price-rules">
          {groups.map((g) => (
            <li
              key={g.ruleIds.join()}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm">
                  {g.rule.label ? <Badge className="me-2">{g.rule.label}</Badge> : null}
                  {describe(g.rule)}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {joinList(
                    g.rule.amounts.map(
                      (a) =>
                        `${t('minutes', { count: String(a.durationMinutes) })}: ${formatMoney({ amount: a.amount, currency: g.rule.currency }, locale)}`,
                    ),
                    locale,
                  )}
                </p>
                <p className="mt-1 text-xs text-ink-muted">{courtsOf(g)}</p>
              </div>
              {editable ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(g)}>
                    {t('pricing.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => g.ruleIds.forEach((id) => remove.mutate(id))}
                    busy={remove.isPending && g.ruleIds.includes(remove.variables ?? '')}
                  >
                    {t('pricing.remove')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      {editable ? (
        <BandForm
          key={editing ? editing.ruleIds.join() : 'new'}
          schedule={schedule}
          currency={pricing.data.currency}
          editing={editing}
          onDone={() => setEditing(null)}
        />
      ) : null}
      <PricePreview schedule={schedule} bdStart={bdStart} />
    </div>
  );
}

interface BandGroup {
  ruleIds: string[];
  resourceIds: string[];
  rule: PriceRuleView;
}

/** Identical bands on several courts are shown (and edited) once. */
function groupRules(rules: readonly PriceRuleView[]): BandGroup[] {
  const groups = new Map<string, BandGroup>();
  for (const rule of rules) {
    const key = JSON.stringify([
      [...rule.daysOfWeek].sort(),
      rule.startMinute,
      rule.endMinute,
      rule.dateFrom,
      rule.dateTo,
      rule.priority,
      rule.label,
      rule.amounts,
    ]);
    const g = groups.get(key);
    if (g) {
      g.ruleIds.push(rule.id);
      g.resourceIds.push(rule.resourceId);
    } else groups.set(key, { ruleIds: [rule.id], resourceIds: [rule.resourceId], rule });
  }
  return [...groups.values()];
}

function BandForm({
  schedule,
  currency,
  editing,
  onDone,
}: {
  schedule: VenueSchedule;
  currency: string;
  editing: BandGroup | null;
  onDone: () => void;
}) {
  const t = useTranslations('web.manage');
  const tc = useTranslations('common.actions');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const bdStart = schedule.venue.businessDayStartMinute;
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const today = businessToday(schedule.venue.timezone, bdStart);
  const initial = editing?.rule;
  const [resourceIds, setResourceIds] = useState<string[]>(
    editing ? editing.resourceIds : resources.map((r) => r.id),
  );
  const [days, setDays] = useState<number[]>(
    initial ? [...initial.daysOfWeek] : [1, 2, 3, 4, 5, 6, 7],
  );
  const [from, setFrom] = useState(initial?.startMinute ?? bdStart);
  const [to, setTo] = useState(initial?.endMinute ?? bdStart + 1440);
  const [special, setSpecial] = useState(Boolean(initial?.dateFrom));
  const [dateFrom, setDateFrom] = useState(initial?.dateFrom ?? today);
  const [dateTo, setDateTo] = useState(initial?.dateTo ?? today);
  const [priority, setPriority] = useState(initial?.priority ?? 0);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [prices, setPrices] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (initial?.amounts ?? []).map((a) => [
        a.durationMinutes,
        toMajorString(a.amount, currency, false),
      ]),
    ),
  );
  const allSelected = resources.every((r) => resourceIds.includes(r.id));
  const [invalid, setInvalid] = useState(false);

  const durations = [
    ...new Set(
      resources.filter((r) => resourceIds.includes(r.id)).flatMap((r) => r.policy.slotDurations),
    ),
  ].sort((a, b) => a - b);
  const steps = Array.from({ length: 49 }, (_, i) => bdStart + i * 30);

  const add = useMutation({
    mutationFn: async (amounts: Array<{ durationMinutes: number; amount: number }>) => {
      const rule = {
        daysOfWeek: days,
        startMinute: from,
        endMinute: to,
        dateFrom: special ? dateFrom : null,
        dateTo: special ? dateTo : null,
        priority,
        label: label.trim() || null,
        amounts,
      };
      if (!editing) {
        return api(createPriceRules, {
          params: { venueId: schedule.venue.id },
          body: { resourceIds, rule },
        });
      }
      // Rules are immutable: each court's rule is replaced (archived and recreated).
      let latest;
      for (const ruleId of editing.ruleIds) {
        latest = await api(replacePriceRule, { params: { ruleId }, body: { rule } });
      }
      return latest!;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['pricing', schedule.venue.id], data);
      setPrices({});
      setLabel('');
      if (editing) onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amounts: Array<{ durationMinutes: number; amount: number }> = [];
    for (const d of durations) {
      const raw = prices[d]?.trim();
      if (!raw) continue;
      const amount = parseMajor(raw, currency);
      if (amount === null) {
        setInvalid(true);
        return;
      }
      amounts.push({ durationMinutes: d, amount });
    }
    setInvalid(amounts.length === 0);
    if (amounts.length > 0) add.mutate(amounts);
  };

  return (
    <Card>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <h2 className="font-display text-2xl leading-tight sm:col-span-2">
          {editing ? t('pricing.editTitle') : t('pricing.add')}
        </h2>
        {add.isError ? (
          <Alert tone="error" className="sm:col-span-2">
            {errorMessage(add.error)}
          </Alert>
        ) : null}
        {invalid ? (
          <Alert tone="error" className="sm:col-span-2">
            {t('pricing.invalidPrice')}
          </Alert>
        ) : null}
        {add.isSuccess ? (
          <Alert tone="success" className="sm:col-span-2">
            {t('pricing.added')}
          </Alert>
        ) : null}
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t('pricing.resources')}</legend>
          <div className="flex flex-wrap gap-4">
            <CheckboxField
              label={t('pricing.allCourts')}
              checked={allSelected}
              disabled={Boolean(editing)}
              onChange={(e) => setResourceIds(e.target.checked ? resources.map((r) => r.id) : [])}
            />
            {resources.map((r) => (
              <CheckboxField
                key={r.id}
                label={pick(r.name, locale)}
                disabled={Boolean(editing)}
                checked={resourceIds.includes(r.id)}
                onChange={(e) =>
                  setResourceIds((ids) =>
                    e.target.checked ? [...ids, r.id] : ids.filter((id) => id !== r.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">{t('pricing.days')}</legend>
          <div className="flex flex-wrap gap-4">
            {weekdaysInDisplayOrder.map((d) => (
              <CheckboxField
                key={d}
                label={format.dateTime(isoWeekdayDate(d), { weekday: 'long', timeZone: 'UTC' })}
                checked={days.includes(d)}
                onChange={(e) =>
                  setDays((ds) => (e.target.checked ? [...ds, d] : ds.filter((x) => x !== d)))
                }
              />
            ))}
          </div>
        </fieldset>
        <SelectField
          label={t('pricing.from')}
          value={from}
          onChange={(e) => {
            const v = Number(e.target.value);
            setFrom(v);
            if (to <= v) setTo(v + 30);
          }}
          name="bandFrom"
        >
          {steps.slice(0, -1).map((m) => (
            <option key={m} value={m}>
              {m >= 1440 ? `${minutesToTime(m)} ${t('hours.nextDay')}` : minutesToTime(m)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('pricing.to')}
          value={to}
          onChange={(e) => setTo(Number(e.target.value))}
          name="bandTo"
        >
          {steps
            .filter((m) => m > from)
            .map((m) => (
              <option key={m} value={m}>
                {m >= 1440 ? `${minutesToTime(m)} ${t('hours.nextDay')}` : minutesToTime(m)}
              </option>
            ))}
        </SelectField>
        {durations.map((d) => (
          <TextField
            key={d}
            label={t('pricing.priceFor', { duration: t('minutes', { count: String(d) }) })}
            placeholder={t('pricing.pricePlaceholder')}
            inputMode="decimal"
            dir="ltr"
            value={prices[d] ?? ''}
            onChange={(e) => setPrices((p) => ({ ...p, [d]: e.target.value }))}
            name={`price-${d}`}
          />
        ))}
        <SelectField
          label={t('pricing.priority')}
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          name="bandPriority"
        >
          {PRIORITIES.map((p) => (
            <option key={p.key} value={p.value}>
              {t(`pricing.priorities.${p.key}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('pricing.label')}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          name="bandLabel"
        />
        <CheckboxField
          className="sm:col-span-2"
          label={t('pricing.specialPeriod')}
          checked={special}
          onChange={(e) => setSpecial(e.target.checked)}
        />
        {special ? (
          <>
            <DateSelect
              from={today}
              days={400}
              label={t('pricing.dateFrom')}
              value={dateFrom}
              onChange={(v) => setDateFrom(v)}
            />
            <DateSelect
              from={dateFrom}
              days={400}
              label={t('pricing.dateTo')}
              value={dateTo}
              onChange={(v) => setDateTo(v)}
            />
          </>
        ) : null}
        <div className="sm:col-span-2">
          <Button
            type="submit"
            busy={add.isPending}
            disabled={resourceIds.length === 0 || days.length === 0}
          >
            {editing ? tc('save') : t('pricing.add')}
          </Button>
          {editing ? (
            <Button variant="ghost" className="ms-2" onClick={onDone}>
              {tc('cancel')}
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

function PricePreview({ schedule, bdStart }: { schedule: VenueSchedule; bdStart: number }) {
  const t = useTranslations('web.manage');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '');
  const today = businessToday(schedule.venue.timezone, bdStart);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState(18 * 60);
  const resource = resources.find((r) => r.id === resourceId);
  const [duration, setDuration] = useState(resource?.policy.slotDurations[0] ?? 60);
  const check = useMutation({
    mutationFn: () =>
      api(previewQuote, {
        params: { resourceId },
        query: { date, startTime: minutesToTime(start), durationMinutes: duration },
      }),
  });
  const starts = Array.from({ length: 48 }, (_, i) => bdStart + i * 30);

  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          check.mutate();
        }}
      >
        <h2 className="font-display text-2xl leading-tight sm:col-span-2 lg:col-span-4">
          {t('pricing.previewTitle')}
        </h2>
        <SelectField
          label={t('calendar.resource')}
          value={resourceId}
          onChange={(e) => {
            setResourceId(e.target.value);
            setDuration(
              resources.find((r) => r.id === e.target.value)?.policy.slotDurations[0] ?? 60,
            );
          }}
          name="previewResource"
        >
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {pick(r.name, locale)}
            </option>
          ))}
        </SelectField>
        <DateSelect
          from={addDays(today, -7)}
          days={60}
          label={t('pricing.previewDate')}
          value={date}
          onChange={(v) => setDate(v)}
          name="previewDate"
        />
        <SelectField
          label={t('calendar.start')}
          value={start}
          onChange={(e) => setStart(Number(e.target.value))}
          name="previewStart"
        >
          {starts.map((m) => (
            <option key={m} value={m}>
              {minutesToTime(m)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('calendar.duration')}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          name="previewDuration"
        >
          {(resource?.policy.slotDurations ?? [60]).map((d) => (
            <option key={d} value={d}>
              {t('minutes', { count: String(d) })}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="secondary" busy={check.isPending}>
            {t('pricing.check')}
          </Button>
          {check.isError ? <Alert tone="error">{errorMessage(check.error)}</Alert> : null}
          {check.data ? (
            <p className="font-medium" role="status" data-testid="price-preview">
              {check.data.price
                ? t('pricing.previewResult', { price: formatMoney(check.data.price, locale) })
                : t('pricing.noPrice')}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
