'use client';

import {
  createBookingHold,
  getVenueAvailability,
  type PricedAvailability,
  type PublicResource,
} from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Spinner, cx } from '@jordan-sports/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Icon } from './icons';
import { isApiError, useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { useMe } from '@/lib/session';
import { addDays, businessToday, dateForLabel } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

type Slot = PricedAvailability['resources'][number]['slots'][number];

interface Props {
  slug: string;
  timezone: string;
  resources: PublicResource[];
  initialDate?: string | undefined;
  initialTime?: string | undefined;
}

interface Choice {
  resourceId: string;
  slot: Slot;
}

const WEEKS = 4;

const chip = (active: boolean) =>
  cx(
    'rounded-md border text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-700',
    active
      ? 'border-brand-700 bg-brand-700 text-white'
      : 'border-line bg-surface text-ink hover:bg-canvas',
  );

/**
 * Public booking picker: length first, then day, then start time — across any free court (the
 * cheapest free court at that time is booked) or per court. Tapping a time holds it.
 */
export function VenueAvailability({ slug, timezone, resources, initialDate, initialTime }: Props) {
  const t = useTranslations('web.availability');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Business day start is not exposed publicly; 06:00 matches the default and only affects 00:00–06:00.
  const today = businessToday(timezone, 360);
  const lastDay = addDays(today, WEEKS * 7 - 1);
  const startDate =
    initialDate && initialDate >= today && initialDate <= lastDay ? initialDate : today;
  const [week, setWeek] = useState(() =>
    Math.floor(
      (new Date(`${startDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
        (7 * 86_400_000),
    ),
  );
  const [date, setDate] = useState(startDate);
  const [duration, setDuration] = useState<number | null>(null);
  const [byCourt, setByCourt] = useState(false);
  const [holding, setHolding] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, week * 7 + i));

  const availability = useQuery({
    queryKey: ['availability', slug, date],
    queryFn: () => api(getVenueAvailability, { params: { slug }, query: { date } }),
  });
  const data = availability.data;
  const durations = [
    ...new Set(data?.resources.flatMap((r) => r.slots.map((s) => s.durationMinutes)) ?? []),
  ].sort((a, b) => a - b);
  const activeDuration = duration && durations.includes(duration) ? duration : durations[0];
  const nameOf = (id: string) => pick(resources.find((r) => r.id === id)?.name, locale);

  const free = (data?.resources ?? []).map((r) => ({
    resourceId: r.resourceId,
    slots: r.slots.filter((s) => s.available && s.durationMinutes === activeDuration),
  }));
  // "Any court": each start time once, offering the cheapest free courts first.
  const byTime = new Map<string, Choice[]>();
  for (const r of free) {
    for (const slot of r.slots) {
      byTime.set(slot.start, [
        ...(byTime.get(slot.start) ?? []),
        { resourceId: r.resourceId, slot },
      ]);
    }
  }
  const times = [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, choices]) => ({
      start,
      choices: [...choices].sort((a, b) => a.slot.price.amount - b.slot.price.amount),
    }));
  const multipleCourts = free.length > 1;

  async function book(choices: Choice[], key: string) {
    if (holding) return;
    if (!me.data) {
      router.push({ pathname: '/sign-in', query: { next: `/venues/${slug}` } });
      return;
    }
    setHolding(key);
    setHoldError(null);
    for (const [index, choice] of choices.entries()) {
      try {
        const booking = await api(createBookingHold, {
          body: {
            resourceId: choice.resourceId,
            start: choice.slot.start,
            durationMinutes: choice.slot.durationMinutes,
          },
          idempotencyKey: crypto.randomUUID(),
        });
        router.push(`/bookings/${booking.id}`);
        return;
      } catch (error) {
        // Someone just took this court: try the next free court at the same time.
        if (isApiError(error, 'SLOT_UNAVAILABLE') && index < choices.length - 1) continue;
        setHoldError(errorMessage(error));
        setHolding(null);
        await queryClient.invalidateQueries({ queryKey: ['availability', slug] });
        return;
      }
    }
  }

  const timeButton = (key: string, slot: Slot, choices: Choice[]) => (
    <li key={key} data-testid="slot">
      <button
        type="button"
        onClick={() => void book(choices, key)}
        disabled={holding !== null}
        aria-busy={holding === key}
        aria-label={t('slotLabel', {
          time: slot.localStart,
          price: formatMoney(slot.price, locale),
        })}
        className={cx(
          'flex w-full flex-col items-center rounded-md border px-2 py-2 disabled:opacity-60',
          'border-brand-300 bg-brand-50 text-brand-900 hover:bg-brand-100',
          'focus-visible:outline-2 focus-visible:outline-brand-700',
          initialTime === slot.localStart && 'ring-2 ring-brand-700',
        )}
      >
        <span dir="ltr" className="text-base font-bold">
          {slot.localStart}
        </span>
        <span className="text-xs">{formatMoney(slot.price, locale)}</span>
      </button>
    </li>
  );

  return (
    <section aria-labelledby="availability-heading" className="min-w-0">
      <h2 id="availability-heading" className="text-xl font-bold">
        {t('title')}
      </h2>

      {durations.length > 0 ? (
        <div role="group" aria-label={t('durationLabel')} className="mt-3 flex gap-2">
          {durations.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === activeDuration}
              onClick={() => setDuration(d)}
              className={cx(chip(d === activeDuration), 'min-h-11 flex-1 px-3')}
            >
              {t('duration', { duration: String(d) })}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setWeek((w) => w - 1)}
          disabled={week === 0}
          aria-label={t('previousWeek')}
          className="grid size-9 shrink-0 place-items-center rounded-md text-lg text-ink-muted hover:bg-canvas disabled:opacity-30"
        >
          <Icon name="chevron" className="size-5 rotate-180 rtl:rotate-0" />
        </button>
        <div role="group" aria-label={t('date')} className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDate(d)}
              aria-pressed={d === date}
              className={cx(chip(d === date), 'flex flex-col items-center px-0 py-1.5')}
            >
              <span className="text-[11px] leading-tight">
                {format.dateTime(dateForLabel(d), { weekday: 'short' })}
              </span>
              <span className="text-base font-bold leading-tight">
                {format.dateTime(dateForLabel(d), { day: 'numeric', numberingSystem: 'latn' })}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setWeek((w) => w + 1)}
          disabled={week === WEEKS - 1}
          aria-label={t('nextWeek')}
          className="grid size-9 shrink-0 place-items-center rounded-md text-lg text-ink-muted hover:bg-canvas disabled:opacity-30"
        >
          <Icon name="chevron" className="size-5 rtl:rotate-180" />
        </button>
      </div>

      {multipleCourts ? (
        <div role="group" aria-label={t('courtMode')} className="mt-3 flex gap-2 text-sm">
          <button
            type="button"
            aria-pressed={!byCourt}
            onClick={() => setByCourt(false)}
            className={cx(chip(!byCourt), 'px-3 py-1.5')}
          >
            {t('anyCourt')}
          </button>
          <button
            type="button"
            aria-pressed={byCourt}
            onClick={() => setByCourt(true)}
            className={cx(chip(byCourt), 'px-3 py-1.5')}
          >
            {t('chooseCourt')}
          </button>
        </div>
      ) : null}

      {availability.isPending ? (
        <div className="mt-4">
          <Spinner label={t('loading')} />
        </div>
      ) : null}
      {availability.isError ? (
        <Alert tone="error" className="mt-4">
          {errorMessage(availability.error)}
        </Alert>
      ) : null}
      {holdError ? (
        <Alert tone="error" className="mt-4">
          {holdError}
        </Alert>
      ) : null}
      {holding ? (
        <div className="mt-4">
          <Spinner label={t('holding')} />
        </div>
      ) : null}

      {data ? (
        <div className="mt-4 flex flex-col gap-4">
          {times.length === 0 ? <p className="text-ink-muted">{t('noSlots')}</p> : null}
          {times.length > 0 && !byCourt ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {times.map(({ start, choices }) =>
                timeButton(`any-${start}`, choices[0]!.slot, choices),
              )}
            </ul>
          ) : null}
          {times.length > 0 && byCourt
            ? free.map((r, index) => (
                <details
                  key={r.resourceId}
                  open={index === 0}
                  data-testid="availability-resource"
                  className="rounded-lg border border-line bg-surface"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 font-bold">
                    <span>{nameOf(r.resourceId)}</span>
                    <span className="text-sm font-normal text-ink-muted">
                      {t('freeCount', { count: r.slots.length, n: String(r.slots.length) })}
                    </span>
                  </summary>
                  <ul className="grid grid-cols-3 gap-2 px-4 pb-4 sm:grid-cols-5">
                    {r.slots.map((s) =>
                      timeButton(`${r.resourceId}-${s.start}`, s, [
                        { resourceId: r.resourceId, slot: s },
                      ]),
                    )}
                  </ul>
                </details>
              ))
            : null}
          <p className="text-sm text-ink-muted">{t('bookHint')}</p>
        </div>
      ) : null}
    </section>
  );
}
