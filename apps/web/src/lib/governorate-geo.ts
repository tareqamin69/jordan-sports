import { GOVERNORATE_GEO, geoDistanceKm } from '@jordan-sports/contracts/web';

/** Centre of a governorate (see packages/contracts/src/geo.ts), to centre the wizard's map. */
export function governorateCenter(key: string): { lat: number; lng: number } | null {
  const g = GOVERNORATE_GEO[key];
  return g ? { lat: g.lat, lng: g.lng } : null;
}

/** Whether a point is within the governorate's approximate radius of its centre. */
export function isNearGovernorate(location: { lat: number; lng: number }, key: string): boolean {
  const g = GOVERNORATE_GEO[key];
  if (!g) return true;
  return geoDistanceKm(location, g) <= g.radiusKm;
}
