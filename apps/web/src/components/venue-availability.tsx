'use client';

import {
  createBookingHold,
  getVenueAvailability,
  type PricedAvailability,
  type PublicResource,
} from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Button, Skeleton, SkeletonGroup, chipClass, cx, useToast } from '@jordan-sports/ui';
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
  /** Days ahead players can book (the venue's rule). */
  windowDays: number;
  resources: PublicResource[];
  initialDate?: string | undefined;
  initialTime?: string | undefined;
}

interface Choice {
  resourceId: string;
  slot: Slot;
}

const dayTile = (active: boolean) =>
  cx(
    'flex flex-col items-center gap-0.5 rounded-[1.125rem] border py-2 transition-colors duration-200',
    active
      ? 'border-primary bg-primary text-on-primary'
      : 'border-line bg-canvas text-ink hover:border-line-strong hover:bg-surface',
  );

const arrow =
  'grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-canvas disabled:opacity-30 disabled:hover:bg-transparent';

/**
 * Public booking picker: length first, then day, then start time — across any free court (the
 * cheapest free court at that time is booked) or per court. Tapping a time selects it and opens
 * a booking bar (a bottom sheet on phones) with the time, price and Book; Book holds it.
 */
export function VenueAvailability({
  slug,
  timezone,
  windowDays,
  resources,
  initialDate,
  initialTime,
}: Props) {
  const WEEKS = Math.max(1, Math.ceil(windowDays / 7));
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
  const lastDay = addDays(today, windowDays - 1);
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
  const [holding, setHolding] = useState(false);
  const [selected, setSelected] = useState<{ key: string; choices: Choice[] } | null>(null);
  const toast = useToast();
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
  // Price heat: where each free time sits between the day's cheapest and dearest price.
  const amounts = free.flatMap((r) => r.slots.map((s) => s.price.amount));
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const heat = (amount: number): 'low' | 'mid' | 'high' | null =>
    amounts.length === 0 || low === high
      ? null
      : amount === low
        ? 'low'
        : amount === high
          ? 'high'
          : 'mid';

  // A new day, length or court mode starts a fresh choice.
  const pickDate = (d: string) => {
    setDate(d);
    setSelected(null);
  };
  const pickDuration = (d: number) => {
    setDuration(d);
    setSelected(null);
  };
  const pickMode = (court: boolean) => {
    setByCourt(court);
    setSelected(null);
  };

  async function book(choices: Choice[]) {
    if (holding) return;
    const first = choices[0]!.slot;
    // A quick tap can beat the "who am I" request: wait for it rather than sending a signed-in
    // player to the sign-in page.
    const user = me.data ?? (me.isPending ? (await me.refetch()).data : null);
    if (!user) {
      // Back on the venue after signing in, the same day and time are highlighted.
      router.push({
        pathname: '/sign-in',
        query: {
          next: `/venues/${slug}?date=${date}&time=${encodeURIComponent(first.localStart)}`,
        },
      });
      return;
    }
    setHolding(true);
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
        toast(errorMessage(error), 'error');
        setHolding(false);
        setSelected(null);
        await queryClient.invalidateQueries({ queryKey: ['availability', slug] });
        return;
      }
    }
  }

  const timeButton = (key: string, slot: Slot, choices: Choice[]) => {
    const active = selected?.key === key;
    return (
      <li key={key} data-testid="slot">
        <button
          type="button"
          onClick={() => setSelected(active ? null : { key, choices })}
          disabled={holding}
          aria-pressed={active}
          aria-label={t('slotLabel', {
            time: slot.localStart,
            price: formatMoney(slot.price, locale),
          })}
          className={cx(
            'group flex w-full flex-col items-center gap-0.5 rounded-2xl border px-2 py-3 transition-[background-color,border-color,color,transform,box-shadow] duration-fast ease-soft active:scale-[0.95] disabled:opacity-60',
            active
              ? 'animate-pop border-primary bg-primary text-on-primary shadow-lift'
              : 'border-line bg-surface hover:border-primary hover:bg-brand-50',
            !active && initialTime === slot.localStart && 'border-primary ring-2 ring-primary/25',
          )}
        >
          <span dir="ltr" className="text-base font-bold leading-6">
            {slot.localStart}
          </span>
          <span
            className={cx(
              'text-xs transition-colors',
              active ? 'text-on-primary/80' : 'text-ink-muted',
            )}
          >
            {formatMoney(slot.price, locale)}
          </span>
          {heat(slot.price.amount) ? (
            <span
              aria-hidden
              data-heat={heat(slot.price.amount)}
              className={cx(
                'mt-1 h-1 w-6 rounded-full',
                active
                  ? 'bg-on-primary/60'
                  : heat(slot.price.amount) === 'low'
                    ? 'bg-primary'
                    : heat(slot.price.amount) === 'high'
                      ? 'bg-accent-400'
                      : 'bg-sand-300',
              )}
            />
          ) : null}
        </button>
      </li>
    );
  };
  const choice = selected?.choices[0];

  return (
    <section aria-labelledby="availability-heading" className="min-w-0">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="availability-heading" className="font-display text-[1.75rem] leading-[1.25]">
            {t('title')}
          </h2>
          <p className="text-sm text-ink-muted">
            {format.dateTime(dateForLabel(days[0]!), {
              month: 'long',
              year: 'numeric',
              numberingSystem: 'latn',
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setWeek((w) => w - 1)}
            disabled={week === 0}
            aria-label={t('previousWeek')}
            className={arrow}
          >
            <Icon name="chevron" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
          <button
            type="button"
            onClick={() => setWeek((w) => w + 1)}
            disabled={week === WEEKS - 1}
            aria-label={t('nextWeek')}
            className={arrow}
          >
            <Icon name="chevron" className="size-5 rtl:rotate-180" />
          </button>
        </div>
      </div>

      {durations.length > 0 ? (
        <div role="group" aria-label={t('durationLabel')} className="mt-4 flex flex-wrap gap-2">
          {durations.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === activeDuration}
              onClick={() => pickDuration(d)}
              className={chipClass(d === activeDuration, {
                tone: 'night',
                className: 'min-h-11 px-5',
              })}
            >
              {t('duration', { duration: String(d) })}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-5">
        <div role="group" aria-label={t('date')} className="grid grid-cols-7 gap-1.5">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => pickDate(d)}
              disabled={d > lastDay}
              aria-pressed={d === date}
              className={cx(dayTile(d === date), d > lastDay && 'pointer-events-none opacity-30')}
            >
              <span className="text-[11px] leading-4 opacity-80">
                {format.dateTime(dateForLabel(d), { weekday: 'short' })}
              </span>
              <span className="text-lg font-bold leading-6">
                {format.dateTime(dateForLabel(d), { day: 'numeric', numberingSystem: 'latn' })}
              </span>
            </button>
          ))}
        </div>
      </div>

      {multipleCourts ? (
        <div role="group" aria-label={t('courtMode')} className="mt-4 flex gap-2">
          <button
            type="button"
            aria-pressed={!byCourt}
            onClick={() => pickMode(false)}
            className={chipClass(!byCourt)}
          >
            {t('anyCourt')}
          </button>
          <button
            type="button"
            aria-pressed={byCourt}
            onClick={() => pickMode(true)}
            className={chipClass(byCourt)}
          >
            {t('chooseCourt')}
          </button>
        </div>
      ) : null}

      {availability.isPending ? (
        <SkeletonGroup
          label={t('loading')}
          className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5"
        >
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-[4.25rem] rounded-2xl" />
          ))}
        </SkeletonGroup>
      ) : null}
      {availability.isError ? (
        <Alert tone="error" className="mt-4">
          {errorMessage(availability.error)}
        </Alert>
      ) : null}

      {data ? (
        <div className="mt-5 flex flex-col gap-4">
          {times.length === 0 ? <p className="text-ink-muted">{t('noSlots')}</p> : null}
          {times.length > 0 && !byCourt ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
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
                  className="rounded-tile border border-line bg-canvas"
                >
                  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 font-bold">
                    <span>{nameOf(r.resourceId)}</span>
                    <span className="text-sm font-normal text-ink-muted">
                      {t('freeCount', { count: r.slots.length, n: String(r.slots.length) })}
                    </span>
                  </summary>
                  <ul className="grid grid-cols-3 gap-2 px-3 pb-3 sm:grid-cols-4 xl:grid-cols-5">
                    {r.slots.map((s) =>
                      timeButton(`${r.resourceId}-${s.start}`, s, [
                        { resourceId: r.resourceId, slot: s },
                      ]),
                    )}
                  </ul>
                </details>
              ))
            : null}
          {low !== high && amounts.length > 0 ? (
            <p
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted"
              data-testid="price-heat-legend"
            >
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-1 w-5 rounded-full bg-primary" />
                {t('heatLow', {
                  price: formatMoney(
                    { amount: low, currency: free[0]?.slots[0]?.price.currency ?? 'JOD' },
                    locale,
                  ),
                })}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-1 w-5 rounded-full bg-accent-400" />
                {t('heatHigh', {
                  price: formatMoney(
                    { amount: high, currency: free[0]?.slots[0]?.price.currency ?? 'JOD' },
                    locale,
                  ),
                })}
              </span>
            </p>
          ) : null}
          <p className="text-sm text-ink-muted">{t('bookHint')}</p>
        </div>
      ) : null}

      {selected && choice ? (
        // Phones: a bottom sheet over the tab bar. Wider screens: sticks to the bottom of the card.
        <div
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 animate-sheet md:sticky md:inset-x-auto md:bottom-4 md:mt-5 md:animate-pop"
          data-testid="booking-bar"
        >
          <div className="flex items-center gap-3 rounded-[1.75rem] bg-night p-2.5 ps-5 text-canvas shadow-float">
            <div key={selected.key} className="flex min-w-0 flex-1 animate-fade flex-col">
              <span className="flex items-baseline gap-2">
                <span dir="ltr" className="text-xl font-bold leading-7">
                  {choice.slot.localStart}
                </span>
                <span className="text-base font-semibold text-lime">
                  {formatMoney(choice.slot.price, locale)}
                </span>
              </span>
              <span className="truncate text-xs text-canvas/70">
                {[
                  t('selectedSummary', {
                    day: format.dateTime(dateForLabel(date), {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      numberingSystem: 'latn',
                    }),
                    minutes: choice.slot.durationMinutes,
                  }),
                  byCourt ? nameOf(choice.resourceId) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              disabled={holding}
              aria-label={t('clearSelection')}
              className="pressable grid size-11 shrink-0 place-items-center rounded-full text-canvas/70 hover:bg-canvas/10 hover:text-canvas"
            >
              <Icon name="close" className="size-5" />
            </button>
            <Button
              onClick={() => void book(selected.choices)}
              busy={holding}
              variant="inverse"
              className="shrink-0 px-7"
              data-testid="book-selected"
            >
              {holding ? t('holding') : t('bookSelected')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
