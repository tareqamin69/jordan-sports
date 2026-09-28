import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

/**
 * OpenFreeMap's "Liberty" style: free, no API key, no rate limit (unlike MapTiler/Stadia, which
 * need one). It's vector tiles, so — unlike the raster OSM tiles used before — the label text can
 * be switched per locale after load, instead of always showing whichever name OSM's own default
 * renderer picked.
 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Raster OpenStreetMap tiles — the previous style, kept as a fallback for when the vector style
 * above can't be reached. It shows whichever name OSM's own renderer already picked (Arabic for
 * most Jordanian places), just without the per-locale switch `localizeMapLabels` gives the vector
 * style.
 */
export const FALLBACK_RASTER_STYLE: StyleSpecification = {
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

/**
 * Falls back to the raster style if the vector one can't load (network issue, the free host being
 * down) — otherwise a failed style fetch leaves the map blank. Swaps at most once.
 */
export function attachStyleFallback(map: MapLibreMap): void {
  let fellBack = false;
  map.once('error', () => {
    if (fellBack || map.isStyleLoaded()) return;
    fellBack = true;
    map.setStyle(FALLBACK_RASTER_STYLE);
  });
}

/**
 * Points every symbol layer's label at the locale's name tag (falling back to the tag-less
 * default `name`, which is itself Arabic for most Jordanian places/roads already). Call once the
 * style has finished loading — layers aren't queryable before then. A no-op on the raster
 * fallback style, which has no symbol layers to begin with.
 */
export function localizeMapLabels(map: MapLibreMap, locale: 'ar' | 'en'): void {
  const preferred = locale === 'ar' ? 'name:ar' : 'name:en';
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== 'symbol') continue;
    if (map.getLayoutProperty(layer.id, 'text-field') === undefined) continue;
    map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', preferred], ['get', 'name']]);
  }
}
