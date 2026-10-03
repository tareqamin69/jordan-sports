'use client';

import { listVenues, type VenueSummary } from '@jordan-sports/contracts/web';
import { Button, cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { distanceKm, usePlace } from '@/lib/place';
import { useErrorMessage } from '@/lib/use-error-message';
import { Icon } from './icons';
import { VenueCard } from './venue-card';

// MapLibre and the map tiles load only when someone switches to the map (speed and privacy).
const ResultsMap = dynamic(() => import('./results-map').then((m) => m.ResultsMap), {
  ssr: false,
  loading: () => (
    <div aria-hidden className="skeleton mt-6 aspect-[3/4] w-full rounded-card sm:aspect-[16/9]" />
  ),
});

type Filters = { sport?: string; governorate?: string; area?: string };
type Sort = 'recommended' | 'price' | 'nearest';

/**
 * The venues list with sorting (recommended, cheapest, nearest), a list/map switch and "show
 * more" (cursor paging) after the server-rendered first page. Sorting covers the loaded venues.
 */
export function VenueResults(props: Parameters<typeof ResultsList>[0]) {
  // New results from the server (a new query) start a fresh list: paging and sorting state reset.
  return (
    <ResultsList key={props.initial.map((v) => v.id).join(',') + (props.date ?? '')} {...props} />
  );
}

function ResultsList({
  initial,
  nextCursor,
  filters,
  date,
  tonight = false,
  pageSize,
}: {
  initial: VenueSummary[];
  nextCursor: string | null;
  filters: Filters;
  date?: string | undefined;
  /** Searching tonight: venues with free times get a "free tonight" badge. */
  tonight?: boolean;
  pageSize: number;
}) {
  const t = useTranslations('web.venues');
  const ta = useTranslations('common.actions');
  const locale = useLocale();
  const api = useApi();
  const errorMessage = useErrorMessage();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosenSort, setSort] = useState<Sort | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  // Shared with the home page: the player's remembered choice (position or governorate), kept on
  // this device only. With a position, the list starts nearest first.
  const place = usePlace();
  const here = place.position;
  const sort: Sort = chosenSort ?? (here ? 'nearest' : 'recommended');
  const locating =
    place.status === 'locating' ? 'busy' : place.status === 'denied' ? 'denied' : 'idle';

  async function more() {
    if (!cursor) return;
    setBusy(true);
    setError(null);
    try {
      const page = await api(listVenues, { query: { ...filters, limit: pageSize, cursor } });
      setItems((list) => [...list, ...page.items.filter((v) => !list.some((x) => x.id === v.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const chooseSort = (next: Sort) => {
    setSort(next);
    // "Nearest" asks for the position here (a tap), and remembers the choice like the home card.
    if (next === 'nearest' && !here) void place.shareLocation();
  };

  const withDistance = items.map((v) => ({
    v,
    d: here && v.location ? distanceKm(here, v.location) : undefined,
  }));
  // "Recommended" puts the remembered governorate first, keeping the server's order within each.
  const recommended = place.governorate
    ? [
        ...withDistance.filter((x) => x.v.governorate.key === place.governorate),
        ...withDistance.filter((x) => x.v.governorate.key !== place.governorate),
      ]
    : withDistance;
  const sorted =
    sort === 'price'
      ? [...withDistance].sort(
          (a, b) => (a.v.priceFrom?.amount ?? Infinity) - (b.v.priceFrom?.amount ?? Infinity),
        )
      : sort === 'nearest' && here
        ? [...withDistance].sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
        : recommended;

  const segment = (active: boolean) =>
    cx(
      'pressable flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
      active ? 'bg-night text-canvas' : 'text-ink hover:bg-sand-100',
    );

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          {t('sortLabel')}
          <select
            value={sort}
            onChange={(e) => chooseSort(e.target.value as Sort)}
            className="h-10 rounded-full border border-line-strong bg-surface pe-8 ps-4 text-sm font-medium text-ink"
            name="sort"
          >
            <option value="recommended">{t('sortRecommended')}</option>
            <option value="price">{t('sortPrice')}</option>
            <option value="nearest">{t('sortNearest')}</option>
          </select>
        </label>
        <div
          role="group"
          aria-label={t('viewLabel')}
          className="flex rounded-full border border-line-strong bg-surface p-1"
        >
          <button
            type="button"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            className={segment(view === 'list')}
          >
            <Icon name="grid" className="size-4" />
            {t('viewList')}
          </button>
          <button
            type="button"
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
            className={segment(view === 'map')}
            data-testid="view-map"
          >
            <Icon name="map" className="size-4" />
            {t('viewMap')}
          </button>
        </div>
      </div>
      {sort === 'nearest' && locating !== 'idle' ? (
        <p className="mt-2 text-sm text-ink-muted" role="status">
          {locating === 'busy' ? t('locating') : t('locationDenied')}
        </p>
      ) : null}

      {view === 'map' ? (
        <ResultsMap venues={sorted.map((x) => x.v)} />
      ) : (
        <ul className="reveal-stagger mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map(({ v, d }) => (
            <li key={v.id}>
              <VenueCard venue={v} locale={locale} date={date} distanceKm={d} tonight={tonight} />
            </li>
          ))}
        </ul>
      )}
      {cursor ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => void more()}
            data-testid="venues-more"
          >
            {ta('loadMore')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
