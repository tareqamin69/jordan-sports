'use client';

import {
  archivePriceRule,
  createPriceRules,
  getVenuePricing,
  previewQuote,
  type PriceRuleView,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import { formatMoney, parseMajor } from '@jordan-sports/money';
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
import { joinList, pick } from '@/lib/localized';
import { can } from '@/lib/manage';
import {
  businessToday,
  dateForLabel,
  isoWeekdayDate,
  minutesToTime,
  weekdaysInDisplayOrder,
} from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

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

  const weekday = (d: number) =>
    format.dateTime(isoWeekdayDate(d), { weekday: 'short', timeZone: 'UTC' });
  const describe = (rule: PriceRuleView) => {
    const days = weekdaysInDisplayOrder.filter((d) => rule.daysOfWeek.includes(d)).map(weekday);
    const band = `${minutesToTime(rule.startMinute)}–${minutesToTime(rule.endMinute)}`;
    const dates =
      rule.dateFrom && rule.dateTo
        ? ` · ${format.dateTime(dateForLabel(rule.dateFrom), 'date')}${rule.dateTo !== rule.dateFrom ? ` – ${format.dateTime(dateForLabel(rule.dateTo), 'date')}` : ''}`
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
        {resources.map((r) => {
          const rules = pricing.data.rules.filter((rule) => rule.resourceId === r.id);
          if (rules.length === 0) return null;
          return (
            <section key={r.id} className="mt-5">
              <h3 className="font-bold">{pick(r.name, locale)}</h3>
              <ul className="mt-2 divide-y divide-line" data-testid="price-rules">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-sm">
                        {rule.label ? <Badge className="me-2">{rule.label}</Badge> : null}
                        {describe(rule)}
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {joinList(
                          rule.amounts.map(
                            (a) =>
                              `${t('minutes', { count: String(a.durationMinutes) })}: ${formatMoney({ amount: a.amount, currency: rule.currency }, locale)}`,
                          ),
                          locale,
                        )}
                      </p>
                    </div>
                    {editable ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove.mutate(rule.id)}
                        busy={remove.isPending && remove.variables === rule.id}
                      >
                        {t('pricing.remove')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Card>
      {editable ? <AddBandForm schedule={schedule} currency={pricing.data.currency} /> : null}
      <PricePreview schedule={schedule} bdStart={bdStart} />
    </div>
  );
}

function AddBandForm({ schedule, currency }: { schedule: VenueSchedule; currency: string }) {
  const t = useTranslations('web.manage');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const queryClient = useQueryClient();
  const errorMessage = useErrorMessage();
  const bdStart = schedule.venue.businessDayStartMinute;
  const resources = schedule.resources.filter((r) => r.status !== 'archived');
  const today = businessToday(schedule.venue.timezone, bdStart);
  const [resourceIds, setResourceIds] = useState<string[]>(resources.map((r) => r.id));
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [from, setFrom] = useState(bdStart);
  const [to, setTo] = useState(bdStart + 1440);
  const [special, setSpecial] = useState(false);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [priority, setPriority] = useState(0);
  const [label, setLabel] = useState('');
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [invalid, setInvalid] = useState(false);

  const durations = [
    ...new Set(
      resources.filter((r) => resourceIds.includes(r.id)).flatMap((r) => r.policy.slotDurations),
    ),
  ].sort((a, b) => a - b);
  const steps = Array.from({ length: 49 }, (_, i) => bdStart + i * 30);

  const add = useMutation({
    mutationFn: (amounts: Array<{ durationMinutes: number; amount: number }>) =>
      api(createPriceRules, {
        params: { venueId: schedule.venue.id },
        body: {
          resourceIds,
          rule: {
            daysOfWeek: days,
            startMinute: from,
            endMinute: to,
            dateFrom: special ? dateFrom : null,
            dateTo: special ? dateTo : null,
            priority,
            label: label.trim() || null,
            amounts,
          },
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['pricing', schedule.venue.id], data);
      setPrices({});
      setLabel('');
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
        <h2 className="text-lg font-bold sm:col-span-2">{t('pricing.add')}</h2>
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
            {resources.map((r) => (
              <CheckboxField
                key={r.id}
                label={pick(r.name, locale)}
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
            <TextField
              label={t('pricing.dateFrom')}
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              dir="ltr"
            />
            <TextField
              label={t('pricing.dateTo')}
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(e) => setDateTo(e.target.value)}
              dir="ltr"
            />
          </>
        ) : null}
        <div className="sm:col-span-2">
          <Button
            type="submit"
            busy={add.isPending}
            disabled={resourceIds.length === 0 || days.length === 0}
          >
            {t('pricing.add')}
          </Button>
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
  const [date, setDate] = useState(businessToday(schedule.venue.timezone, bdStart));
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
        <h2 className="text-lg font-bold sm:col-span-2 lg:col-span-4">
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
        <TextField
          label={t('pricing.previewDate')}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          dir="ltr"
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
