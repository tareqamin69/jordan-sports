'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { attachStyleFallback, localizeMapLabels, MAP_STYLE_URL } from '@/lib/map-style';

/** Amman, roughly centered — used when the owner hasn't set a pin yet. */
const defaultCenter = { lat: 31.9539, lng: 35.9106 };

/** A draggable pin for the registration wizard's location step: click or drag to set the venue's map position. */
export function LocationPicker({
  location,
  onChange,
}: {
  location: { lat: number; lng: number } | null;
  onChange: (location: { lat: number; lng: number }) => void;
}) {
  const t = useTranslations('web.manage.register');
  const locale = useLocale() as 'ar' | 'en';
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!container.current) return;
    const center = location ?? defaultCenter;
    const m = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [center.lng, center.lat],
      zoom: location ? 15 : 11,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    attachStyleFallback(m);
    m.on('style.load', () => localizeMapLabels(m, locale));
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    const mk = new Marker({ color: '#0f4d34', draggable: true })
      .setLngLat([center.lng, center.lat])
      .addTo(m);
    mk.on('dragend', () => {
      const { lat, lng } = mk.getLngLat();
      onChangeRef.current({ lat, lng });
    });
    m.on('click', (e) => {
      mk.setLngLat(e.lngLat);
      onChangeRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.current = m;
    marker.current = mk;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // Only ever initialize once: dragging/clicking updates state, which must not re-center the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-canvas-deep">
        <div ref={container} className="size-full" />
      </div>
      <p className="mt-2 text-sm text-ink-muted">{t('locationHint')}</p>
    </div>
  );
}
