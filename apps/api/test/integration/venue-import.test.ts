import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlacesClient } from '../../src/modules/venue-import/application/places-client.js';
import { REDIS } from '../../src/platform/redis/redis.module.js';
import { call, createTestApp, signInAdmin, signInPlayer, type TestApp } from '../support/app.js';

const link =
  'https://www.google.com/maps/place/Smash+Padel+Club/@31.95,35.88,15z/data=!3m1!4b1!4m6!3m5!8m2!3d31.9539!4d35.9106';

describe('import a venue from a Google Maps link', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('pre-fills name, pin and governorate from the link alone (owner and admin)', async () => {
    const catalog = (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json() as {
      governorates: Array<{ id: string; key: string }>;
    };
    const amman = catalog.governorates.find((g) => g.key === 'amman')!.id;
    const player = await signInPlayer(t.app);
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/manage/venue-import',
      cookie: player.cookie,
      body: { url: link },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      source: 'link',
      name: 'Smash Padel Club',
      location: { lat: 31.9539, lng: 35.9106 },
      governorateId: amman,
      placeId: null,
      weeklyHours: null,
    });

    const admin = await signInAdmin(t.app, 'admin');
    const a = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/venue-import',
      cookie: admin.cookie,
      body: { url: link },
    });
    expect(a.statusCode, a.body).toBe(200);
  });

  it('never dead-ends with an error page: unreadable links are a 422 the form ignores', async () => {
    const player = await signInPlayer(t.app);
    for (const url of [
      'https://evil.example/maps/place/x',
      'https://www.google.com/search?q=padel',
    ]) {
      const r = await call(t.app, {
        method: 'POST',
        url: '/v1/manage/venue-import',
        cookie: player.cookie,
        body: { url },
      });
      expect(r.statusCode, url).toBe(422);
      expect(r.json()).toMatchObject({ code: 'MAP_LINK_UNREADABLE' });
    }
    expect(
      (await call(t.app, { method: 'POST', url: '/v1/manage/venue-import', body: { url: link } }))
        .statusCode,
    ).toBe(401);
  });

  it('Places (optional): field mask, cache by place, hard daily cap, silent fallback', async () => {
    const redis = t.app.get<Redis>(REDIS);
    await redis.del(
      `places:day:${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' })}`,
    );
    const calls: RequestInit[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      calls.push(init);
      return new Response(
        JSON.stringify({
          places: [
            {
              id: `place-${calls.length}`,
              displayName: { text: 'Smash' },
              internationalPhoneNumber: '+962 79 123 4567',
              websiteUri: 'https://smash.example',
              formattedAddress: 'Sweifieh, Amman',
              regularOpeningHours: {
                periods: [{ open: { day: 1, hour: 8 }, close: { day: 1, hour: 23 } }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const places = new PlacesClient('k'.repeat(30), 1, redis, fakeFetch);
    const first = await places.lookup(`Smash ${Date.now()}`, { lat: 31.95, lng: 35.91 });
    expect(first).toMatchObject({
      phone: '+962 79 123 4567',
      weeklyHours: [{ dayOfWeek: 1, startMinute: 480, durationMinutes: 900 }],
    });
    const headers = calls[0]!.headers as Record<string, string>;
    expect(headers['x-goog-fieldmask']).not.toContain('photos');
    // Over the daily cap: no request, null (the import falls back to the link).
    expect(await places.lookup(`Other ${Date.now()}`, null)).toBeNull();
    expect(calls).toHaveLength(1);
    // Disabled without a key.
    expect(await new PlacesClient(null, 30, redis, fakeFetch).lookup('x', null)).toBeNull();
  });
});
