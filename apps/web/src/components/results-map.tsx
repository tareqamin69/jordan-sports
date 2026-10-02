'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { VenueSummary } from '@jordan-sports/contracts';
import { formatMoney } from '@jordan-sports/money';
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from 'maplibre-gl';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { attachStyleFallback, localizeMapLabels, MAP_STYLE_URL } from '@/lib/map-style';
import { pick } from '@/lib/localized';

/** Search results on a map: one pin per venue with a location; a pin opens its name and price. */
export function ResultsMap({ venues }: { venues: VenueSummary[] }) {
  const t = useTranslations('web.venues');
  const locale = useLocale() as 'ar' | 'en';
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const placed = venues.filter((v) => v.location);
    if (!container.current || placed.length === 0) return;
    const map = new MapLibreMap({
      container: container.current,
      style: MAP_STYLE_URL,
      center: [placed[0]!.location!.lng, placed[0]!.location!.lat],
      zoom: 11,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    attachStyleFallback(map);
    map.on('style.load', () => localizeMapLabels(map, locale));
    const bounds = new LngLatBounds();
    for (const v of placed) {
      const { lat, lng } = v.location!;
      bounds.extend([lng, lat]);
      // Built from DOM nodes (textContent), never HTML strings: venue names come from owners.
      const box = document.createElement('div');
      box.className = 'flex flex-col gap-0.5 p-1 text-sm';
      const link = document.createElement('a');
      link.href = `/${locale}/venues/${v.slug}`;
      link.className = 'font-bold text-primary underline-offset-2 hover:underline';
      link.textContent = pick(v.name, locale);
      box.append(link);
      if (v.priceFrom) {
        const price = document.createElement('span');
        price.className = 'text-ink-muted';
        price.textContent = `${t('from')} ${formatMoney(v.priceFrom, locale)}`;
        box.append(price);
      }
      const marker = new Marker({ color: '#0f4d34' })
        .setLngLat([lng, lat])
        .setPopup(new Popup({ offset: 24, closeButton: false }).setDOMContent(box))
        .addTo(map);
      marker.getElement().setAttribute('aria-label', pick(v.name, locale));
    }
    if (placed.length > 1) map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });
    return () => map.remove();
  }, [venues, locale, t]);

  const missing = venues.filter((v) => !v.location).length;
  return (
    <div className="mt-6 animate-fade" data-testid="results-map">
      <div
        ref={container}
        role="region"
        aria-label={t('mapTitle')}
        className="aspect-[3/4] w-full overflow-hidden rounded-card border border-line bg-canvas-deep sm:aspect-[16/9]"
      />
      {missing > 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{t('mapMissing', { count: missing })}</p>
      ) : null}
    </div>
  );
}
