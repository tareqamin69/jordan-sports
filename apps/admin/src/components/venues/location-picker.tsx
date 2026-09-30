'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import { useLocale } from 'next-intl';
import { useEffect, useRef } from 'react';
import { attachStyleFallback, localizeMapLabels, MAP_STYLE_URL } from '@/lib/map-style';

/** Amman, roughly centered — used when the venue has no pin yet. */
const fallbackCenter = { lat: 31.9539, lng: 35.9106 };

/**
 * Admin venue editor: click the map or drag the pin to set the venue's position (same map and
 * behavior as the owner's registration wizard). The typed coordinates stay editable next to it.
 */
export function LocationPicker({
  location,
  onChange,
  label,
}: {
  location: { lat: number; lng: number } | null;
  onChange: (location: { lat: number; lng: number }) => void;
  label: string;
}) {
  const locale = useLocale() as 'ar' | 'en';
  const container = useRef<HTMLDivElement>(null);
  const marker = useRef<Marker | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!container.current) return;
    const center = location ?? fallbackCenter;
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
    mk.getElement().setAttribute('aria-label', label);
    const round = (n: number) => Math.round(n * 1e6) / 1e6;
    mk.on('dragend', () => {
      const { lat, lng } = mk.getLngLat();
      onChangeRef.current({ lat: round(lat), lng: round(lng) });
    });
    m.on('click', (e) => {
      mk.setLngLat(e.lngLat);
      onChangeRef.current({ lat: round(e.lngLat.lat), lng: round(e.lngLat.lng) });
    });
    map.current = m;
    marker.current = mk;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // Initialize once; typed coordinates move the pin through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typed coordinates move the pin (and the view) too.
  useEffect(() => {
    if (!location || !marker.current) return;
    const current = marker.current.getLngLat();
    if (Math.abs(current.lat - location.lat) < 1e-7 && Math.abs(current.lng - location.lng) < 1e-7)
      return;
    marker.current.setLngLat([location.lng, location.lat]);
    map.current?.easeTo({ center: [location.lng, location.lat] });
  }, [location]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-canvas-deep sm:aspect-[16/9]">
      <div ref={container} className="size-full" data-testid="admin-location-map" />
    </div>
  );
}
