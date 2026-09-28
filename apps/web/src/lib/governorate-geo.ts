/**
 * Approximate center point and a generous radius (km) per governorate — enough to center the
 * registration wizard's map and to sanity-check a dropped pin, not surveyed administrative
 * boundaries. Keys match `catalog.governorates[].key` (see migrations 0003/0008).
 */
const GOVERNORATE_GEO: Record<string, { lat: number; lng: number; radiusKm: number }> = {
  amman: { lat: 31.9454, lng: 35.9284, radiusKm: 30 },
  irbid: { lat: 32.5556, lng: 35.85, radiusKm: 25 },
  zarqa: { lat: 32.0728, lng: 36.0876, radiusKm: 30 },
  aqaba: { lat: 29.5321, lng: 35.0063, radiusKm: 35 },
  balqa: { lat: 32.0389, lng: 35.7272, radiusKm: 20 },
  madaba: { lat: 31.7167, lng: 35.7833, radiusKm: 18 },
  jerash: { lat: 32.2811, lng: 35.8994, radiusKm: 18 },
  ajloun: { lat: 32.3326, lng: 35.7517, radiusKm: 15 },
  karak: { lat: 31.1855, lng: 35.7047, radiusKm: 30 },
  mafraq: { lat: 32.3431, lng: 36.2081, radiusKm: 45 },
  tafilah: { lat: 30.8373, lng: 35.6044, radiusKm: 25 },
  maan: { lat: 30.1962, lng: 35.735, radiusKm: 55 },
};

export function governorateCenter(key: string): { lat: number; lng: number } | null {
  const g = GOVERNORATE_GEO[key];
  return g ? { lat: g.lat, lng: g.lng } : null;
}

/** Great-circle distance in km (haversine). */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Whether a point is within the governorate's approximate radius of its center. */
export function isNearGovernorate(location: { lat: number; lng: number }, key: string): boolean {
  const g = GOVERNORATE_GEO[key];
  if (!g) return true;
  return distanceKm(location, g) <= g.radiusKm;
}
