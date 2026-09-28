'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { attachStyleFallback, localizeMapLabels, MAP_STYLE_URL } from '@/lib/map-style';

/** The venue's location on an interactive map (MapLibre GL, OpenFreeMap vector tiles, no key). */
export function VenueMap({
  location,
  name,
}: {
  location: { lat: number; lng: number };
  name: string;
}) {
  const t = useTranslations('web.venue');
  const locale = useLocale() as 'ar' | 'en';
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [location.lng, location.lat],
      zoom: 15,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    new Marker({ color: '#0f4d34' }).setLngLat([location.lng, location.lat]).addTo(map);
    attachStyleFallback(map);
    // `style.load` (not `load`) so this still fires if the vector style fails and
    // attachStyleFallback swaps in the raster one — `load` only ever fires for the first style.
    map.on('style.load', () => {
      localizeMapLabels(map, locale);
      setReady(true);
    });
    return () => map.remove();
  }, [location.lat, location.lng, locale]);

  return (
    <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-canvas-deep">
      <div ref={container} role="img" aria-label={t('mapTitle', { name })} className="size-full" />
      {!ready ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
          <span className="size-6 animate-spin rounded-full border-2 border-ink-muted border-t-transparent" />
        </div>
      ) : null}
    </div>
  );
}
