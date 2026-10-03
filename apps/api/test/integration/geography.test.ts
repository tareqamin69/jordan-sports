import { randomInt } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, signInAdmin, type TestApp } from '../support/app.js';

describe('geography and sports catalog (admin)', () => {
  let t: TestApp;
  let admin: string;
  let support: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await signInAdmin(t.app, 'owner')).cookie;
    support = (await signInAdmin(t.app, 'support')).cookie;
  });
  afterAll(async () => {
    await t?.close();
  });

  it('serves all 12 governorates and a Jordan-wide sports catalog', async () => {
    const r = await call(t.app, { method: 'GET', url: '/v1/catalog' });
    expect(r.statusCode).toBe(200);
    const catalog = r.json() as {
      governorates: Array<{ key: string; areas: unknown[] }>;
      sports: Array<{ key: string }>;
      offeredSportIds: string[];
    };
    const keys = catalog.governorates.map((g) => g.key).sort();
    expect(keys).toEqual(
      [
        'ajloun',
        'amman',
        'aqaba',
        'balqa',
        'irbid',
        'jerash',
        'karak',
        'maan',
        'mafraq',
        'madaba',
        'tafilah',
        'zarqa',
      ].sort(),
    );
    expect(catalog.governorates.every((g) => g.areas.length > 0)).toBe(true);
    expect(catalog.sports.map((s) => s.key)).toEqual(
      expect.arrayContaining(['football', 'padel', 'tennis', 'basketball', 'badminton', 'gym']),
    );
    // No approved venue offers a sport by default in a fresh test database.
    expect(catalog.offeredSportIds).toEqual([]);
  });

  it('adds and renames a governorate and an area without a release', async () => {
    const suffix = randomInt(0, 1e9);
    const created = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/geography/governorates',
      cookie: admin,
      body: { key: `test_gov_${suffix}`, name: { ar: 'محافظة تجريبية', en: 'Test Governorate' } },
    });
    expect(created.statusCode).toBe(201);
    const catalog1 = created.json() as {
      governorates: Array<{ id: string; key: string; name: { ar: string; en: string } }>;
    };
    const gov = catalog1.governorates.find((g) => g.key === `test_gov_${suffix}`)!;
    expect(gov.name).toEqual({ ar: 'محافظة تجريبية', en: 'Test Governorate' });

    const renamed = await call(t.app, {
      method: 'PATCH',
      url: `/v1/admin/geography/governorates/${gov.id}`,
      cookie: admin,
      body: { name: { ar: 'محافظة معدّلة', en: 'Renamed Governorate' } },
    });
    expect(renamed.statusCode).toBe(200);

    const area = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/geography/governorates/${gov.id}/areas`,
      cookie: admin,
      body: { key: `test_area_${suffix}`, name: { ar: 'منطقة تجريبية', en: 'Test Area' } },
    });
    expect(area.statusCode).toBe(201);
    const catalog2 = area.json() as {
      governorates: Array<{ id: string; areas: Array<{ key: string; name: { en: string } }> }>;
    };
    const areas = catalog2.governorates.find((g) => g.id === gov.id)!.areas;
    expect(areas.map((a) => a.key)).toContain(`test_area_${suffix}`);

    // Rejects a duplicate key and an unknown parent governorate.
    const duplicate = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/geography/governorates',
      cookie: admin,
      body: { key: `test_gov_${suffix}`, name: { en: 'Dup' } },
    });
    expect(duplicate.statusCode).toBe(400);

    // A non-catalog.manage admin role is refused.
    const denied = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/geography/governorates',
      cookie: support,
      body: { key: `test_gov2_${suffix}`, name: { en: 'Nope' } },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('adds a sport with its first format and resource type, then renames it', async () => {
    const suffix = randomInt(0, 1e9);
    const created = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/sports',
      cookie: admin,
      body: {
        key: `test_sport_${suffix}`,
        name: { ar: 'رياضة تجريبية', en: 'Test Sport' },
        icon: 'ball-generic',
        format: {
          key: 'standard',
          name: { ar: 'عادي', en: 'Standard' },
          minPlayers: 2,
          maxPlayers: 4,
          defaultDurationMinutes: 60,
        },
        resourceType: {
          key: `test_court_${suffix}`,
          name: { ar: 'ملعب تجريبي', en: 'Test court' },
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const catalog1 = created.json() as {
      sports: Array<{
        id: string;
        key: string;
        formats: Array<{ id: string; key: string; minPlayers: number; maxPlayers: number }>;
      }>;
      resourceTypes: Array<{ key: string; sportFormatIds: string[] }>;
    };
    const sport = catalog1.sports.find((s) => s.key === `test_sport_${suffix}`)!;
    expect(sport.formats).toEqual([
      expect.objectContaining({ key: 'standard', minPlayers: 2, maxPlayers: 4 }),
    ]);
    const resourceType = catalog1.resourceTypes.find((rt) => rt.key === `test_court_${suffix}`)!;
    expect(resourceType.sportFormatIds).toEqual([sport.formats[0]!.id]);

    const renamed = await call(t.app, {
      method: 'PATCH',
      url: `/v1/admin/sports/${sport.id}`,
      cookie: admin,
      body: { name: { ar: 'رياضة معدّلة', en: 'Renamed Sport' }, icon: 'ball-bounce' },
    });
    expect(renamed.statusCode).toBe(200);
    const catalog2 = renamed.json() as {
      sports: Array<{ id: string; icon: string; name: { en: string } }>;
    };
    const updated = catalog2.sports.find((s) => s.id === sport.id)!;
    expect(updated.icon).toBe('ball-bounce');
    expect(updated.name.en).toBe('Renamed Sport');

    // minPlayers > maxPlayers is rejected.
    const invalid = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/sports',
      cookie: admin,
      body: {
        key: `test_sport2_${suffix}`,
        name: { en: 'Bad' },
        icon: 'ball-generic',
        format: {
          key: 'x',
          name: { en: 'X' },
          minPlayers: 5,
          maxPlayers: 2,
          defaultDurationMinutes: 60,
        },
        resourceType: { key: `test_court2_${suffix}`, name: { en: 'X' } },
      },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('shows a sport in offeredSportIds only once an approved venue offers it', async () => {
    const suffix = randomInt(0, 1e9);
    const catalog = (await (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json()) as {
      governorates: Array<{ id: string; key: string }>;
      sports: Array<{ id: string; key: string; formats: Array<{ id: string }> }>;
      resourceTypes: Array<{ id: string; key: string; sportFormatIds: string[] }>;
      offeredSportIds: string[];
    };
    const amman = catalog.governorates.find((g) => g.key === 'amman')!;
    const tennis = catalog.sports.find((s) => s.key === 'tennis')!;
    const tennisCourt = catalog.resourceTypes.find((rt) => rt.key === 'tennis_court')!;

    const orgRes = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/organizations',
      cookie: admin,
      body: {
        slug: `geo-org-${suffix}`,
        name: { en: 'Geo Org' },
        owner: { phone: `+96279${String(randomInt(1000000, 9999999))}`, displayName: 'Owner' },
      },
    });
    expect(orgRes.statusCode).toBe(201);
    const org = orgRes.json() as { id: string; ownerPhone?: string };

    const venueRes = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/organizations/${org.id}/venues`,
      cookie: admin,
      body: {
        slug: `geo-venue-${suffix}`,
        name: { en: 'Geo Venue' },
        governorateId: amman.id,
      },
    });
    expect(venueRes.statusCode).toBe(201);
    const venue = venueRes.json() as { id: string };

    const resourceRes = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/venues/${venue.id}/resources`,
      cookie: admin,
      body: {
        name: { en: 'Court' },
        resourceTypeId: tennisCourt.id,
        sportFormatIds: [tennis.formats[0]!.id],
      },
    });
    expect(resourceRes.statusCode).toBe(201);

    const approve = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/venues/${venue.id}/status`,
      cookie: admin,
      body: { status: 'approved', reason: 'Test approval' },
    });
    expect(approve.statusCode).toBe(201);

    const after = (await (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json()) as {
      offeredSportIds: string[];
    };
    expect(after.offeredSportIds).toContain(tennis.id);
    expect(
      (after as unknown as { sportVenueCounts: Record<string, number> }).sportVenueCounts[
        tennis.id
      ],
    ).toBe(1);
  });
});
