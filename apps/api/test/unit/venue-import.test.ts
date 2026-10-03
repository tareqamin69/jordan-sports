import { describe, expect, it } from 'vitest';
import {
  isPrivateAddress,
  resolveMapLink,
  type HopFetcher,
} from '../../src/modules/venue-import/application/link-resolver.js';
import { parseMapUrl } from '../../src/modules/venue-import/domain/map-link.js';
import { toWeeklyWindows } from '../../src/modules/venue-import/domain/opening-hours.js';
import { governorateForPoint } from '@jordan-sports/contracts';

const place =
  'https://www.google.com/maps/place/%D9%86%D8%A7%D8%AF%D9%8A+%D8%A7%D9%84%D8%A8%D8%A7%D8%AF%D9%84/@31.9500,35.8800,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d31.9539!4d35.9106';

describe('map links', () => {
  it('reads the place name and prefers the pin over the viewport centre', () => {
    expect(parseMapUrl(new URL(place))).toEqual({
      name: 'نادي البادل',
      location: { lat: 31.9539, lng: 35.9106 },
    });
  });

  it('falls back to @lat,lng and to q= / query= parameters', () => {
    expect(parseMapUrl(new URL('https://www.google.com/maps/@32.5556,35.85,14z')).location).toEqual(
      {
        lat: 32.5556,
        lng: 35.85,
      },
    );
    expect(parseMapUrl(new URL('https://maps.google.com/?q=29.5321,35.0063'))).toEqual({
      name: null,
      location: { lat: 29.5321, lng: 35.0063 },
    });
    expect(
      parseMapUrl(new URL('https://www.google.com/maps/search/?api=1&query=Smash+Padel')),
    ).toEqual({
      name: 'Smash Padel',
      location: null,
    });
  });

  it('unwraps the consent page', () => {
    const consent = `https://consent.google.com/m?continue=${encodeURIComponent(place)}`;
    expect(parseMapUrl(new URL(consent)).location).toEqual({ lat: 31.9539, lng: 35.9106 });
  });

  it('follows short links through Google hosts only, never anywhere else', async () => {
    const hops: string[] = [];
    const fetcher =
      (map: Record<string, string>): HopFetcher =>
      async (url) => {
        hops.push(url.hostname);
        const location = map[url.toString()];
        return location ? { status: 302, location } : { status: 200, location: null };
      };
    const short = 'https://maps.app.goo.gl/AbC123';
    expect((await resolveMapLink(short, fetcher({ [short]: place })))?.toString()).toBe(place);
    // A redirect off Google is refused, and the foreign host is never contacted.
    hops.length = 0;
    expect(
      await resolveMapLink(short, fetcher({ [short]: 'https://evil.example/maps' })),
    ).toBeNull();
    expect(hops).toEqual(['maps.app.goo.gl']);
    // Not Google, not HTTPS, credentials or ports: refused without any request.
    for (const bad of [
      'https://evil.example/maps/place/x',
      'http://maps.app.goo.gl/AbC123',
      'https://user:pw@www.google.com/maps',
      'https://www.google.com:8443/maps',
      'https://goo.gl/notmaps',
      'not a url',
    ]) {
      expect(await resolveMapLink(bad, fetcher({}))).toBeNull();
    }
    // A redirect loop gives up after 5 hops.
    const loop = fetcher({ [short]: short });
    expect(await resolveMapLink(short, loop)).toBeNull();
  });

  it('treats private and local addresses as off limits', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fd00::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['142.250.180.14', '2a00:1450:4001::200e'])
      expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe('opening hours from Google', () => {
  it('maps periods to ISO weekdays, past midnight included', () => {
    expect(
      toWeeklyWindows([
        { open: { day: 0, hour: 16, minute: 0 }, close: { day: 1, hour: 1, minute: 0 } },
        { open: { day: 5, hour: 9, minute: 30 }, close: { day: 5, hour: 23 } },
      ]),
    ).toEqual([
      { dayOfWeek: 7, startMinute: 960, durationMinutes: 540 },
      { dayOfWeek: 5, startMinute: 570, durationMinutes: 810 },
    ]);
  });

  it('reads "open 24 hours" as every full day', () => {
    expect(toWeeklyWindows([{ open: { day: 0, hour: 0 } }])).toHaveLength(7);
  });
});

describe('governorate of a point', () => {
  it('picks the governorate by distance relative to its size, and nothing abroad', () => {
    expect(governorateForPoint({ lat: 31.9539, lng: 35.9106 })).toBe('amman');
    expect(governorateForPoint({ lat: 29.53, lng: 35.0 })).toBe('aqaba');
    expect(governorateForPoint({ lat: 48.85, lng: 2.35 })).toBeNull();
  });
});
