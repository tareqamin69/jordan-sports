import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { isAllowedMapUrl, isShortLink, parseUrl } from '../domain/map-link.js';

const MAX_HOPS = 5;
const TIMEOUT_MS = 5_000;

/** Private, loopback, link-local, CGNAT and unique-local ranges: never contacted (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe8') ||
    v6.startsWith('fe9') ||
    v6.startsWith('fea') ||
    v6.startsWith('feb')
  );
}

/** DNS lookup that refuses private addresses, used for the actual connection (no TOCTOU gap). */
function guardedLookup(
  hostname: string,
  options: object,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error('Refused address'), { code: 'EACCES' }), '', 4);
    }
    // Node asks for a single address unless `all` was set by the caller.
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

/** One GET that only reads the status line and Location header, then hangs up. */
export type HopFetcher = (
  url: URL,
  signal: AbortSignal,
) => Promise<{ status: number; location: string | null }>;

const httpsHop: HopFetcher = (url, signal) =>
  new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup as never,
        signal,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; JorenaVenueImport/1.0)',
          accept: 'text/html',
        },
      },
      (res) => {
        resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null });
        res.destroy(); // never read the page itself
      },
    );
    req.on('error', reject);
    req.end();
  });

/**
 * The final Google Maps URL behind a pasted link. Short links (maps.app.goo.gl, goo.gl/maps) are
 * followed through HTTP redirects only: every hop must be HTTPS on an allowlisted Google host, at
 * most 5 hops, 5 seconds in total; no page is parsed. Full map URLs are returned as they are.
 * Null when the link is not a usable Google Maps link.
 */
export async function resolveMapLink(
  input: string,
  fetchHop: HopFetcher = httpsHop,
): Promise<URL | null> {
  let url = parseUrl(input);
  if (!url || !isAllowedMapUrl(url)) return null;
  if (!isShortLink(url)) return url;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      const { status, location } = await fetchHop(url, signal);
      if (status < 300 || status >= 400 || !location) return isShortLink(url) ? null : url;
      const next = parseUrl(new URL(location, url).toString());
      if (!next || !isAllowedMapUrl(next)) return null;
      url = next;
      if (!isShortLink(url)) return url;
    }
  } catch {
    return null;
  }
  return null;
}
