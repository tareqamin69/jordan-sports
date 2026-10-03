/**
 * Approximate centre and a generous radius (km) per governorate: enough to centre a map, to
 * sanity-check a dropped pin and to guess the governorate of an imported map link. Not surveyed
 * administrative boundaries. Keys match `catalog.governorates[].key` (migrations 0003/0008).
 * Plain data, no zod: shared by the API and the browser (`@jordan-sports/contracts/web`).
 */
export const GOVERNORATE_GEO: Readonly<
  Record<string, { lat: number; lng: number; radiusKm: number }>
> = {
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

/** Great-circle distance in km (haversine). */
export function geoDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * The governorate a point most plausibly belongs to: the nearest centre, measured in units of each
 * governorate's radius (so a big governorate wins a point near its edge). Null outside Jordan
 * (further than twice the radius from every centre).
 */
export function governorateForPoint(point: { lat: number; lng: number }): string | null {
  let best: { key: string; score: number } | null = null;
  for (const [key, g] of Object.entries(GOVERNORATE_GEO)) {
    const score = geoDistanceKm(point, g) / g.radiusKm;
    if (!best || score < best.score) best = { key, score };
  }
  return best && best.score <= 2 ? best.key : null;
}
