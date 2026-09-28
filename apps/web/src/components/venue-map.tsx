'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type StyleSpecification,
} from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/** Raster OpenStreetMap tiles — no API key. See https://operations.osmfoundation.org/policies/tiles/ */
const style: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** The venue's location on an interactive OpenStreetMap (MapLibre GL, raster tiles, no key). */
export function VenueMap({
  location,
  name,
}: {
  location: { lat: number; lng: number };
  name: string;
}) {
  const t = useTranslations('web.venue');
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style,
      center: [location.lng, location.lat],
      zoom: 15,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    new Marker({ color: '#0f4d34' }).setLngLat([location.lng, location.lat]).addTo(map);
    map.once('load', () => setReady(true));
    return () => map.remove();
  }, [location.lat, location.lng]);

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
