/**
 * Reading Google Maps links (venue import). Pure functions, no network: the resolver
 * (application/link-resolver.ts) follows short-link redirects; this file decides which hosts are
 * acceptable and what a final URL says about the place.
 */

/** Hosts we accept at every hop. Anything else is refused before any request is made. */
const GOOGLE_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
  'google.jo',
  'www.google.jo',
  'maps.google.jo',
  'consent.google.com',
]);

/** Short links that redirect to the real map URL. */
export function isShortLink(url: URL): boolean {
  return (
    url.hostname === 'maps.app.goo.gl' ||
    (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps'))
  );
}

/** HTTPS on a Google Maps host (and, for goo.gl, only its /maps short links). */
export function isAllowedMapUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  if (!GOOGLE_HOSTS.has(url.hostname)) return false;
  // goo.gl and the general Google hosts only for their /maps paths (not search, accounts, …).
  if (url.hostname.startsWith('maps.') || url.hostname === 'maps.app.goo.gl') return true;
  if (url.hostname === 'consent.google.com') return true;
  return url.pathname.startsWith('/maps');
}

export function parseUrl(input: string): URL | null {
  try {
    return new URL(input.trim());
  } catch {
    return null;
  }
}

export interface ParsedPlace {
  readonly name: string | null;
  readonly location: { lat: number; lng: number } | null;
}

const NUM = '(-?\\d{1,3}\\.\\d+)';

function point(lat: string | undefined, lng: string | undefined) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat: Math.round(la * 1e6) / 1e6, lng: Math.round(ln * 1e6) / 1e6 };
}

function cleanName(raw: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    name = raw.replace(/\+/g, ' ');
  }
  name = name.replace(/\s+/g, ' ').trim();
  if (!name || /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(name)) return null;
  return name.slice(0, 120);
}

/**
 * Place name and pin from a (final) Google Maps URL. The pin prefers the place marker
 * (`!3d<lat>!4d<lng>` in the data segment) over the map's viewport centre (`@lat,lng,zoom`),
 * then `q=` / `query=` / `ll=` / `center=` parameters. A consent-page URL is unwrapped first.
 */
export function parseMapUrl(url: URL): ParsedPlace {
  if (url.hostname === 'consent.google.com') {
    const inner = parseUrl(url.searchParams.get('continue') ?? '');
    return inner && isAllowedMapUrl(inner) && inner.hostname !== 'consent.google.com'
      ? parseMapUrl(inner)
      : { name: null, location: null };
  }
  const path = url.pathname + url.search;
  const placeName = /\/maps\/place\/([^/@?]+)/.exec(url.pathname)?.[1];
  const pin = new RegExp(`!3d${NUM}!4d${NUM}`).exec(path);
  const centre = new RegExp(`@${NUM},${NUM}`).exec(url.pathname);
  let location = pin ? point(pin[1], pin[2]) : null;
  let name = placeName ? cleanName(placeName) : null;
  for (const key of ['q', 'query', 'll', 'center', 'destination']) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const coords = new RegExp(`^${NUM},\\s*${NUM}$`).exec(value.trim());
    if (coords) location ??= point(coords[1], coords[2]);
    else if (key === 'q' || key === 'query' || key === 'destination') name ??= cleanName(value);
  }
  location ??= centre ? point(centre[1], centre[2]) : null;
  return { name, location };
}
