'use client';

import { listVenues, type Catalog, type VenueSummary } from '@jordan-sports/contracts/web';
import { Button, ListSkeleton, SectionHeading, chipClass } from '@jordan-sports/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useApi } from '@/lib/api';
import { pick } from '@/lib/localized';
import { distanceKm, usePlace } from '@/lib/place';
import { businessToday } from '@/lib/time';
import { useHydrated } from '@/lib/use-hydrated';
import { Icon } from './icons';
import { VenueCard } from './venue-card';

/** Next whole hour in Amman (HH:00), for "free from now" searches; null late at night. */
function nextHour(): string | null {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Amman',
    }).format(new Date()),
  );
  return hour >= 23 ? null : `${String(hour + 1).padStart(2, '0')}:00`;
}

/**
 * Home, location first: a friendly card asks once whether to show the nearest venues (the browser
 * prompt only appears after "Yes, use my location"); otherwise one-tap governorate chips. Then the
 * nearest (or the chosen governorate's) venues with their next free times today. The choice is
 * remembered on this device; the position never leaves it (sorting happens here).
 */
export function NearbyVenues({ catalog }: { catalog: Catalog }) {
  const t = useTranslations('web.home.near');
  const locale = useLocale();
  const hydrated = useHydrated();
  const place = usePlace();
  const api = useApi();
  const today = businessToday('Asia/Amman', 360);
  const time = nextHour();
  const governorate = catalog.governorates.find((g) => g.key === place.governorate);
  const active = place.position !== null || governorate !== undefined;
  // "Nearest" needs venues that are on the map; a governorate list shows them all.
  const near = place.position !== null && !governorate;
  const usable = (items: VenueSummary[]) => (near ? items.filter((v) => v.location) : items);

  const venues = useQuery({
    queryKey: ['nearby', today, time, governorate?.key ?? 'all', near],
    enabled: active,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VenueSummary[]> => {
      const filter = governorate ? { governorate: governorate.key } : { located: '1' as const };
      // Free times from the next hour today; if nothing is free (or it is late), plain venues.
      if (time) {
        const free = await api(listVenues, { query: { ...filter, limit: 60, date: today, time } });
        if (usable(free.items).length > 0) return usable(free.items);
      }
      return usable((await api(listVenues, { query: { ...filter, limit: 100 } })).items);
    },
  });

  // Never render before hydration: the choice lives in this browser only.
  if (!hydrated) return null;

  if (!place.preference) {
    return (
      <section
        className="mt-8 flex flex-col gap-4 rounded-card bg-sand-100 p-5 sm:flex-row sm:items-center sm:justify-between"
        data-testid="location-card"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-primary">
            <Icon name="pin" className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-lg leading-[1.4]">{t('askTitle')}</h2>
            <p className="text-sm text-sand-700">{t('askBody')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            busy={place.status === 'locating'}
            onClick={() => void place.shareLocation()}
            data-testid="use-location"
          >
            {t('useLocation')}
          </Button>
          <Button size="sm" variant="secondary" onClick={place.later} data-testid="location-later">
            {t('later')}
          </Button>
        </div>
      </section>
    );
  }

  if (!active && place.status !== 'locating') {
    return (
      <section className="mt-8 flex flex-col gap-3" data-testid="governorate-pick">
        <p className="text-sm text-ink-muted">
          {place.status === 'denied' ? t('denied') : t('pickGovernorate')}
        </p>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
          {catalog.governorates.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => place.chooseGovernorate(g.key)}
              className={chipClass(false, { className: 'shrink-0' })}
            >
              {pick(g.name, locale)}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const list = (venues.data ?? [])
    .map((v) => ({
      v,
      d: place.position && v.location ? distanceKm(place.position, v.location) : undefined,
    }))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
    .slice(0, 6);

  return (
    <section aria-labelledby="nearby-heading" className="mt-10" data-testid="nearby">
      <SectionHeading
        id="nearby-heading"
        title={
          governorate ? t('inGovernorate', { name: pick(governorate.name, locale) }) : t('nearest')
        }
        action={
          <button
            type="button"
            onClick={place.reset}
            className="flex min-h-11 items-center gap-1 text-primary hover:text-primary-hover"
          >
            <Icon name="pin" className="size-4" />
            {t('change')}
          </button>
        }
      />
      {venues.isPending || place.status === 'locating' ? (
        <div className="mt-4">
          <ListSkeleton label={t('loading')} rows={2} />
        </div>
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="no-scrollbar -mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:scroll-px-8 sm:px-8">
          {list.map(({ v, d }) => (
            <li
              key={v.id}
              className="w-[82%] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)]"
            >
              <VenueCard
                venue={{ ...v, ...(v.freeTimes ? { freeTimes: v.freeTimes.slice(0, 3) } : {}) }}
                locale={locale}
                date={today}
                distanceKm={d}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
