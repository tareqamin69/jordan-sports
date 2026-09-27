'use client';

import {
  createBookingHold,
  getVenueAvailability,
  type AvailabilitySlot,
  type PublicResource,
} from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { Alert, Spinner, cx } from '@jordan-sports/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useMe } from '@/lib/session';
import { pick } from '@/lib/localized';
import { addDays, businessToday, dateForLabel } from '@/lib/time';
import { useErrorMessage } from '@/lib/use-error-message';

interface Props {
  slug: string;
  timezone: string;
  resources: PublicResource[];
}

/** Public availability with prices for the next 7 days; tapping a free time holds it. */
export function VenueAvailability({ slug, timezone, resources }: Props) {
  const t = useTranslations('web.availability');
  const locale = useLocale();
  const format = useFormatter();
  const api = useApi();
  const errorMessage = useErrorMessage();
  // Business day start is not exposed publicly; 06:00 matches the default and only affects 00:00–06:00.
  const today = businessToday(timezone, 360);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [date, setDate] = useState(today);
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [holding, setHolding] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const availability = useQuery({
    queryKey: ['availability', slug, date],
    queryFn: () => api(getVenueAvailability, { params: { slug }, query: { date } }),
  });

  async function book(resourceId: string, slot: AvailabilitySlot) {
    if (holding) return;
    if (!me.data) {
      router.push({ pathname: '/sign-in', query: { next: `/venues/${slug}` } });
      return;
    }
    const key = `${resourceId}-${slot.start}-${slot.durationMinutes}`;
    setHolding(key);
    setHoldError(null);
    try {
      const booking = await api(createBookingHold, {
        body: { resourceId, start: slot.start, durationMinutes: slot.durationMinutes },
        idempotencyKey: crypto.randomUUID(),
      });
      router.push(`/bookings/${booking.id}`);
    } catch (error) {
      setHoldError(errorMessage(error));
      setHolding(null);
      await queryClient.invalidateQueries({ queryKey: ['availability', slug] });
    }
  }

  return (
    <section aria-labelledby="availability-heading" className="min-w-0">
      <h2 id="availability-heading" className="text-xl font-bold">
        {t('title')}
      </h2>
      <div role="group" aria-label={t('date')} className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDate(d)}
            aria-pressed={d === date}
            className={cx(
              'shrink-0 rounded-md border px-3 py-2 text-sm',
              d === date
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-line bg-surface text-ink hover:bg-canvas',
            )}
          >
            {format.dateTime(dateForLabel(d), 'weekdayShort')}
          </button>
        ))}
      </div>
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
      {availability.data ? (
        <div className="mt-4 flex flex-col gap-5">
          {availability.data.resources.every((r) => r.slots.length === 0) ? (
            <p className="text-ink-muted">{t('noSlots')}</p>
          ) : null}
          {availability.data.resources.map((r) => {
            if (r.slots.length === 0) return null;
            const resource = resources.find((x) => x.id === r.resourceId);
            return (
              <div key={r.resourceId} data-testid="availability-resource">
                <h3 className="font-bold">{pick(resource?.name, locale)}</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {r.slots.map((s) => {
                    const key = `${r.resourceId}-${s.start}-${s.durationMinutes}`;
                    const label = (
                      <>
                        <span dir="ltr" className="font-medium">
                          {s.localStart}–{s.localEnd}
                        </span>
                        <span className="ms-2">
                          {s.available ? formatMoney(s.price, locale) : t('taken')}
                        </span>
                      </>
                    );
                    return (
                      <li key={key} data-testid="slot">
                        {s.available ? (
                          <button
                            type="button"
                            onClick={() => void book(r.resourceId, s)}
                            disabled={holding !== null}
                            aria-busy={holding === key}
                            className="block min-h-11 rounded-md border border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-900 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-700 disabled:opacity-60"
                          >
                            {label}
                          </button>
                        ) : (
                          <span className="block rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink-muted line-through">
                            {label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <p className="text-sm text-ink-muted">{t('bookHint')}</p>
        </div>
      ) : null}
    </section>
  );
}
