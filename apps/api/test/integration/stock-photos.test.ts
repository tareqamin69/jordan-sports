import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importStockPhotos, StockPhotosService } from '../../src/modules/stock-photos/index.js';
import { FilesystemMediaStorage } from '../../src/platform/storage/media-storage.js';
import { bookableVenue, call, createTestApp, signInAdmin, type TestApp } from '../support/app.js';

/** A fake Pexels API: search returns landscape photos, downloads return real images. */
function fakePexels(calls: string[]) {
  let next = 1000;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('https://api.pexels.com/')) {
      expect((init?.headers as Record<string, string>).Authorization).toBe('test-key');
      const photos = Array.from({ length: 6 }, () => {
        const id = next++;
        return {
          id,
          width: 4000,
          height: 2667,
          url: `https://www.pexels.com/photo/court-${id}/`,
          alt: 'An empty court',
          photographer: `Photographer ${id}`,
          photographer_url: `https://www.pexels.com/@p${id}`,
          src: { original: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg` },
        };
      });
      return new Response(JSON.stringify({ photos }), { status: 200 });
    }
    const jpeg = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: { r: 30, g: 110, b: 70 } },
    })
      .jpeg()
      .toBuffer();
    return new Response(jpeg, { status: 200 });
  }) as typeof fetch;
}

describe('illustrative stock photos', () => {
  let t: TestApp;
  let storage: FilesystemMediaStorage;

  beforeAll(async () => {
    t = await createTestApp();
    storage = new FilesystemMediaStorage(t.config.mediaDir);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('downloads, re-encodes and credits photos for every sport, and serves them resized', async () => {
    const calls: string[] = [];
    const manifest = await importStockPhotos(storage, {
      apiKey: 'test-key',
      sportKeys: ['padel', 'unknown_sport'],
      config: {
        perSport: 3,
        sports: { padel: { queries: ['padel court'] } },
        fallbackQueries: ['sports court empty'],
        exclude: [],
      },
      refresh: false,
      fetch: fakePexels(calls),
    });
    expect(manifest.photos.filter((p) => p.sport === 'padel')).toHaveLength(3);
    // A sport without configured queries still gets photos through the fallback queries.
    expect(manifest.photos.filter((p) => p.sport === 'unknown_sport')).toHaveLength(3);
    const first = manifest.photos[0]!;
    expect(first).toMatchObject({ width: 2000, license: 'Pexels License' });
    expect(first.blur).toMatch(/^data:image\/webp;base64,/);
    expect(calls.some((c) => c.includes('images.pexels.com') && c.includes('w=2000'))).toBe(true);

    t.app.get(StockPhotosService).invalidate();
    const small = await call(t.app, { method: 'GET', url: `/v1/stock/${first.id}?w=640` });
    expect(small.statusCode).toBe(200);
    expect(small.headers['content-type']).toBe('image/webp');
    expect((await sharp(small.rawPayload).metadata()).width).toBe(640);
    expect(
      (await call(t.app, { method: 'GET', url: `/v1/stock/${first.id}?w=123` })).statusCode,
    ).toBe(400);
    expect((await call(t.app, { method: 'GET', url: '/v1/stock/pexels-1' })).statusCode).toBe(404);

    const credits = (await call(t.app, { method: 'GET', url: '/v1/stock/credits' })).json() as {
      items: Array<{ photographer: string; sourceUrl: string }>;
    };
    expect(credits.items).toHaveLength(6);
    expect(credits.items[0]!.sourceUrl).toMatch(/^https:\/\/www\.pexels\.com\/photo\//);

    // A second run keeps the chosen photos (no new searches).
    const again: string[] = [];
    await importStockPhotos(storage, {
      apiKey: 'test-key',
      sportKeys: ['padel', 'unknown_sport'],
      config: { perSport: 3, sports: {}, fallbackQueries: ['x'], exclude: [] },
      refresh: false,
      fetch: fakePexels(again),
    });
    expect(again).toHaveLength(0);
  });

  it('venues without photos show a labelled illustrative cover; their own photos always win', async () => {
    const admin = (await signInAdmin(t.app, 'admin')).cookie;
    const venue = await bookableVenue(t.app, admin);
    const catalog = (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json() as {
      sports: Array<{ key: string; photos: Array<{ stock: unknown }> }>;
      counts: { venues: number; sports: number };
    };
    expect(catalog.counts.venues).toBeGreaterThanOrEqual(1);
    const sportKey = (
      (await call(t.app, { method: 'GET', url: `/v1/venues/${venue.slug}` })).json() as {
        sports: Array<{ key: string }>;
      }
    ).sports[0]!.key;
    await importStockPhotos(storage, {
      apiKey: 'test-key',
      sportKeys: [sportKey],
      config: { perSport: 2, sports: {}, fallbackQueries: ['court'], exclude: [] },
      refresh: false,
      fetch: fakePexels([]),
    });
    t.app.get(StockPhotosService).invalidate();

    const withStock = (
      await call(t.app, { method: 'GET', url: `/v1/venues/${venue.slug}` })
    ).json() as {
      cover: { url: string; stock: { photographer: string } | null } | null;
      media: unknown[];
    };
    expect(withStock.media).toHaveLength(0);
    expect(withStock.cover?.url).toMatch(/^\/v1\/stock\/pexels-/);
    expect(withStock.cover?.stock?.photographer).toBeTruthy();
    const sports = (
      (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json() as typeof catalog
    ).sports;
    expect(sports.find((s) => s.key === sportKey)!.photos.length).toBeGreaterThanOrEqual(2);

    const png = await sharp({
      create: { width: 800, height: 500, channels: 3, background: '#335577' },
    })
      .png()
      .toBuffer();
    const up = await t.app.inject({
      method: 'POST',
      url: `/v1/admin/venues/${venue.venueId}/media`,
      headers: { cookie: admin, origin: 'http://localhost:3001', 'content-type': 'image/png' },
      payload: png,
    });
    expect(up.statusCode, up.body).toBe(201);
    const own = (await call(t.app, { method: 'GET', url: `/v1/venues/${venue.slug}` })).json() as {
      cover: { url: string; stock?: unknown; blur: string | null };
    };
    expect(own.cover.url).toMatch(/^\/v1\/media\//);
    expect(own.cover.stock ?? null).toBeNull();
    expect(own.cover.blur).toMatch(/^data:image\/webp/);
    const resized = await call(t.app, { method: 'GET', url: `${own.cover.url}?w=320` });
    expect((await sharp(resized.rawPayload).metadata()).width).toBe(320);
  });
});
