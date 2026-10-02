'use client';

import { listVenues, type VenueSummary } from '@jordan-sports/contracts';
import { Button, cx } from '@jordan-sports/ui';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useApi } from '@/lib/api';
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

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/**
 * The venues list with sorting (recommended, cheapest, nearest), a list/map switch and "show
 * more" (cursor paging) after the server-rendered first page. Sorting covers the loaded venues.
 */
export function VenueResults({
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
  const [sort, setSort] = useState<Sort>('recommended');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<'idle' | 'busy' | 'denied'>('idle');

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
    if (next !== 'nearest' || here) return;
    if (!('geolocation' in navigator)) return setLocating('denied');
    setLocating('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating('idle');
      },
      () => setLocating('denied'),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const withDistance = items.map((v) => ({
    v,
    d: here && v.location ? distanceKm(here, v.location) : undefined,
  }));
  const sorted =
    sort === 'price'
      ? [...withDistance].sort(
          (a, b) => (a.v.priceFrom?.amount ?? Infinity) - (b.v.priceFrom?.amount ?? Infinity),
        )
      : sort === 'nearest' && here
        ? [...withDistance].sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
        : withDistance;

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
