import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  catalogFixture,
  createOrganization,
  createTestApp,
  createVenue,
  signInAdmin,
  type CatalogFixture,
  type TestApp,
} from '../support/app.js';

describe('catalog, venues and resources', () => {
  let t: TestApp;
  let admin: string;
  let fx: CatalogFixture;

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await signInAdmin(t.app)).cookie;
    fx = await catalogFixture(t.app);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('publishes the sport-agnostic catalog as data', async () => {
    const r = await call(t.app, { method: 'GET', url: '/v1/catalog' });
    expect(r.statusCode).toBe(200);
    const catalog = r.json() as {
      sports: Array<{
        key: string;
        name: { ar: string; en: string };
        icon: string;
        formats: unknown[];
      }>;
      resourceTypes: Array<{ attributes: unknown[] }>;
      governorates: Array<{ key: string; timezone: string; areas: unknown[] }>;
      offeredSportIds: string[];
    };
    // Football/padel/tennis lead by sort_order; the catalog also covers the rest of Jordan's
    // common sports (basketball, volleyball, squash, badminton, ... — see migration 0008).
    expect(catalog.sports.slice(0, 3).map((s) => s.key)).toEqual(['football', 'padel', 'tennis']);
    expect(catalog.sports.length).toBeGreaterThanOrEqual(14);
    expect(catalog.sports[0]!.name).toEqual({ ar: 'كرة القدم', en: 'Football' });
    expect(catalog.sports.every((s) => s.formats.length > 0)).toBe(true);
    expect(catalog.sports.every((s) => s.icon.length > 0)).toBe(true);
    expect(catalog.resourceTypes.every((rt) => rt.attributes.length >= 0)).toBe(true);
    // Every governorate of Jordan is present, not only Amman.
    expect(catalog.governorates.length).toBe(12);
    const amman = catalog.governorates.find((g) => g.key === 'amman')!;
    expect(amman).toMatchObject({ timezone: 'Asia/Amman' });
    expect(amman.areas.length).toBeGreaterThan(5);
    const irbid = catalog.governorates.find((g) => g.key === 'irbid')!;
    expect(irbid.areas.length).toBeGreaterThan(0);
  });

  it('runs the venue lifecycle: draft (hidden) → approved (public) → suspended (hidden)', async () => {
    const org = await createOrganization(t.app, admin);
    const { venueId, slug } = await createVenue(t.app, admin, org.id);

    expect((await call(t.app, { method: 'GET', url: `/v1/venues/${slug}` })).statusCode).toBe(404);

    const setStatus = (status: string) =>
      call(t.app, {
        method: 'POST',
        url: `/v1/admin/venues/${venueId}/status`,
        cookie: admin,
        body: { status, reason: 'Lifecycle test step' },
      });

    expect((await setStatus('approved')).json()).toMatchObject({ status: 'approved' });
    const pub = await call(t.app, { method: 'GET', url: `/v1/venues/${slug}` });
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).toMatchObject({
      slug,
      name: { en: 'Test Venue' },
      timezone: 'Asia/Amman',
      currency: 'JOD',
    });
    const list = await call(t.app, {
      method: 'GET',
      url: '/v1/venues?sport=padel&governorate=amman&limit=100',
    });
    expect((list.json() as { items: Array<{ slug: string }> }).items.map((v) => v.slug)).toContain(
      slug,
    );
    const otherSport = await call(t.app, {
      method: 'GET',
      url: '/v1/venues?sport=tennis&limit=100',
    });
    expect(
      (otherSport.json() as { items: Array<{ slug: string }> }).items.map((v) => v.slug),
    ).not.toContain(slug);

    // Invalid transition.
    const bad = await setStatus('draft');
    expect(bad.statusCode).toBe(409);
    expect(bad.json()).toMatchObject({ code: 'INVALID_STATE_TRANSITION' });

    await setStatus('suspended');
    expect((await call(t.app, { method: 'GET', url: `/v1/venues/${slug}` })).statusCode).toBe(404);

    const audit = await call(t.app, {
      method: 'GET',
      url: `/v1/admin/audit-logs?organizationId=${org.id}`,
      cookie: admin,
    });
    const actions = (audit.json() as { items: Array<{ action: string; reason: string | null }> })
      .items;
    expect(
      actions.filter((a) => a.action === 'venue.status_changed').map((a) => a.reason),
    ).toContain('Lifecycle test step');
  });

  it('refuses to approve a venue without an active resource', async () => {
    const org = await createOrganization(t.app, admin);
    const venue = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/organizations/${org.id}/venues`,
      cookie: admin,
      body: { slug: `empty-${Date.now()}`, name: { ar: 'فارغ' }, governorateId: fx.governorateId },
    });
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/venues/${(venue.json() as { id: string }).id}/status`,
      cookie: admin,
      body: { status: 'approved', reason: 'try it' },
    });
    expect(r.statusCode).toBe(409);
  });

  it('rejects duplicate slugs', async () => {
    const org = await createOrganization(t.app, admin);
    const { slug } = await createVenue(t.app, admin, org.id);
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/organizations/${org.id}/venues`,
      cookie: admin,
      body: { slug, name: { en: 'Dup' }, governorateId: fx.governorateId },
    });
    expect(r.json()).toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('stores the profile: location, contact phone, amenities, address', async () => {
    const org = await createOrganization(t.app, admin);
    const { venueId } = await createVenue(t.app, admin, org.id);
    const r = await call(t.app, {
      method: 'PATCH',
      url: `/v1/admin/venues/${venueId}`,
      cookie: admin,
      body: {
        location: { lat: 31.9539, lng: 35.9106 },
        contactPhone: '0791234567',
        amenityIds: fx.amenityIds.slice(0, 2),
        address: { ar: 'شارع المدينة المنورة', en: 'Madina Munawara St' },
        description: { en: 'Indoor courts' },
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      location: { lat: 31.9539, lng: 35.9106 },
      contactPhone: '+962791234567',
      amenityIds: expect.arrayContaining(fx.amenityIds.slice(0, 2)),
      address: { ar: 'شارع المدينة المنورة' },
    });
  });

  describe('resources', () => {
    it('combines two halves into a full pitch that overlaps both (shared units)', async () => {
      const org = await createOrganization(t.app, admin);
      const { venueId } = await createVenue(t.app, admin, org.id, {
        typeKey: 'football_pitch',
        formatKey: 'football.five_a_side',
      });
      const addHalf = async (name: string) =>
        call(t.app, {
          method: 'POST',
          url: `/v1/admin/venues/${venueId}/resources`,
          cookie: admin,
          body: {
            name: { en: name },
            resourceTypeId: fx.types.football_pitch!.id,
            sportFormatIds: [fx.formats['football.five_a_side']],
            attributes: { surface: 'artificial_grass', lighting: true },
          },
        });
      await addHalf('Half A');
      const afterB = (await addHalf('Half B')).json() as {
        resources: Array<{ id: string; name: { en: string } }>;
      };
      const a = afterB.resources.find((r) => r.name.en === 'Half A')!;
      const b = afterB.resources.find((r) => r.name.en === 'Half B')!;

      const full = await call(t.app, {
        method: 'POST',
        url: `/v1/admin/venues/${venueId}/resources`,
        cookie: admin,
        body: {
          name: { en: 'Full pitch' },
          resourceTypeId: fx.types.football_pitch!.id,
          sportFormatIds: [fx.formats['football.seven_a_side']],
          combinesResourceIds: [a.id, b.id],
        },
      });
      expect(full.statusCode).toBe(201);
      const resources = (
        full.json() as {
          resources: Array<{
            id: string;
            name: { en: string };
            unitCount: number;
            overlapsWith: string[];
            features: unknown[];
          }>;
        }
      ).resources;
      const fullPitch = resources.find((r) => r.name.en === 'Full pitch')!;
      const halfA = resources.find((r) => r.id === a.id)!;
      expect(fullPitch.unitCount).toBe(2);
      expect(fullPitch.overlapsWith.sort()).toEqual([a.id, b.id].sort());
      expect(halfA.overlapsWith).toEqual([fullPitch.id]);
      expect(halfA.features).toEqual([
        {
          key: 'surface',
          label: { ar: 'الأرضية', en: 'Surface' },
          value: { ar: 'عشب صناعي', en: 'Artificial grass' },
        },
        { key: 'lighting', label: { ar: 'إنارة ليلية', en: 'Floodlights' }, value: null },
      ]);
    });

    it('validates attributes and sport formats against the resource type (data, not code)', async () => {
      const org = await createOrganization(t.app, admin);
      const { venueId } = await createVenue(t.app, admin, org.id);
      const create = (body: object) =>
        call(t.app, {
          method: 'POST',
          url: `/v1/admin/venues/${venueId}/resources`,
          cookie: admin,
          body,
        });
      const base = {
        name: { en: 'X' },
        resourceTypeId: fx.types.padel_court!.id,
        sportFormatIds: [fx.formats['padel.doubles']],
      };
      expect((await create({ ...base, attributes: { surface: 'clay' } })).json()).toMatchObject({
        code: 'INVALID_ATTRIBUTES',
      });
      expect((await create({ ...base, attributes: { indoor: 'yes' } })).json()).toMatchObject({
        code: 'INVALID_ATTRIBUTES',
      });
      expect(
        (await create({ ...base, sportFormatIds: [fx.formats['tennis.singles']] })).statusCode,
      ).toBe(400);
      expect(
        (await create({ ...base, attributes: { indoor: true, panoramic: true } })).statusCode,
      ).toBe(201);
    });

    it('creates a default booking policy from the formats', async () => {
      const org = await createOrganization(t.app, admin);
      const { resourceIds } = await createVenue(t.app, admin, org.id);
      const policy = await t.ownerPool.query(
        'SELECT slot_durations, hold_minutes FROM resource.booking_policies WHERE resource_id = $1',
        [resourceIds[0]],
      );
      expect(policy.rows[0]).toEqual({ slot_durations: [90], hold_minutes: 10 });
    });

    it('hides inactive resources from the public venue', async () => {
      const org = await createOrganization(t.app, admin);
      const { slug, resourceIds, venueId } = await createVenue(t.app, admin, org.id, {
        approve: true,
      });
      await call(t.app, {
        method: 'POST',
        url: `/v1/admin/venues/${venueId}/resources`,
        cookie: admin,
        body: {
          name: { en: 'Court 2' },
          resourceTypeId: fx.types.padel_court!.id,
          sportFormatIds: [fx.formats['padel.doubles']],
        },
      });
      await call(t.app, {
        method: 'PATCH',
        url: `/v1/admin/resources/${resourceIds[0]}`,
        cookie: admin,
        body: { status: 'inactive' },
      });
      const pub = (await call(t.app, { method: 'GET', url: `/v1/venues/${slug}` })).json() as {
        resources: Array<{ name: { en: string } }>;
      };
      expect(pub.resources.map((r) => r.name.en)).toEqual(['Court 2']);
    });
  });

  describe('photos', () => {
    it('re-encodes uploads to WebP without metadata and serves them only once approved', async () => {
      const org = await createOrganization(t.app, admin);
      const { venueId, slug } = await createVenue(t.app, admin, org.id);
      const jpeg = await sharp({
        create: { width: 3000, height: 1500, channels: 3, background: '#07904f' },
      })
        .jpeg()
        .withExif({ IFD0: { Copyright: 'secret-exif-marker' }, IFD3: { GPSLatitudeRef: 'N' } })
        .toBuffer();
      expect((await sharp(jpeg).metadata()).exif).toBeDefined();

      const upload = await t.app.inject({
        method: 'POST',
        url: `/v1/admin/venues/${venueId}/media`,
        headers: { cookie: admin, origin: 'http://localhost:3001', 'content-type': 'image/jpeg' },
        payload: jpeg,
      });
      expect(upload.statusCode).toBe(201);
      const media = (
        upload.json() as {
          media: Array<{ id: string; width: number; height: number; url: string }>;
        }
      ).media;
      expect(media).toHaveLength(1);
      expect(media[0]).toMatchObject({
        width: 2000,
        height: 1000,
        url: `/v1/media/${media[0]!.id}`,
      });

      // Not public before approval; admins can preview.
      expect((await call(t.app, { method: 'GET', url: media[0]!.url })).statusCode).toBe(404);
      const preview = await call(t.app, {
        method: 'GET',
        url: `/v1/admin/media/${media[0]!.id}`,
        cookie: admin,
      });
      expect(preview.statusCode).toBe(200);

      await call(t.app, {
        method: 'POST',
        url: `/v1/admin/venues/${venueId}/status`,
        cookie: admin,
        body: { status: 'approved', reason: 'Photos reviewed' },
      });
      const served = await call(t.app, { method: 'GET', url: media[0]!.url });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toBe('image/webp');
      const meta = await sharp(served.rawPayload).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(served.rawPayload.includes(Buffer.from('secret-exif-marker'))).toBe(false);

      const pub = (await call(t.app, { method: 'GET', url: `/v1/venues/${slug}` })).json() as {
        cover: { id: string };
      };
      expect(pub.cover.id).toBe(media[0]!.id);
    });

    it('rejects files that are not images', async () => {
      const org = await createOrganization(t.app, admin);
      const { venueId } = await createVenue(t.app, admin, org.id);
      const r = await t.app.inject({
        method: 'POST',
        url: `/v1/admin/venues/${venueId}/media`,
        headers: { cookie: admin, origin: 'http://localhost:3001', 'content-type': 'image/png' },
        payload: Buffer.from('<script>alert(1)</script>'),
      });
      expect(r.statusCode).toBe(415);
      expect(r.json()).toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    });
  });

  it('lets support staff read but not change venues', async () => {
    const support = (await signInAdmin(t.app, 'support')).cookie;
    const org = await createOrganization(t.app, admin);
    const { venueId } = await createVenue(t.app, admin, org.id);
    expect(
      (await call(t.app, { method: 'GET', url: `/v1/admin/venues/${venueId}`, cookie: support }))
        .statusCode,
    ).toBe(200);
    const r = await call(t.app, {
      method: 'PATCH',
      url: `/v1/admin/venues/${venueId}`,
      cookie: support,
      body: { name: { en: 'Hacked' } },
    });
    expect(r.statusCode).toBe(403);
  });
});
