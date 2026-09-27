'use client';

import type { VenueSummary } from '@jordan-sports/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Icon } from './icons';
import { VenueCard } from './venue-card';

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/** Venue cards; "nearest first" asks for the location once and sorts in the browser only. */
export function NearbyVenues({ venues }: { venues: VenueSummary[] }) {
  const t = useTranslations('web.home');
  const locale = useLocale();
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<'idle' | 'locating' | 'denied'>('idle');

  const locate = () => {
    if (!('geolocation' in navigator)) return setState('denied');
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setState('idle');
      },
      () => setState('denied'),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const sorted = here
    ? venues
        .map((v) => ({ v, d: v.location ? distanceKm(here, v.location) : undefined }))
        .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
    : venues.map((v) => ({ v, d: undefined }));

  return (
    <section aria-labelledby="venues-heading" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="venues-heading" className="text-xl font-bold">
          {here ? t('nearestTitle') : t('featuredTitle')}
        </h2>
        <button
          type="button"
          onClick={locate}
          disabled={state === 'locating'}
          className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-brand-900 hover:bg-canvas"
        >
          <Icon name="pin" className="size-4" />
          {state === 'locating' ? t('locating') : t('nearMe')}
        </button>
      </div>
      {state === 'denied' ? (
        <p className="mt-2 text-sm text-ink-muted">{t('locationDenied')}</p>
      ) : null}
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map(({ v, d }) => (
          <li key={v.id}>
            <VenueCard venue={v} locale={locale} distanceKm={d} />
          </li>
        ))}
      </ul>
    </section>
  );
}
