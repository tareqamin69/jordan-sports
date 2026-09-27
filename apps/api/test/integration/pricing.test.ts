import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  catalogFixture,
  createOrganization,
  createTestApp,
  randomPhone,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

function nextWeekday(weekday: number): string {
  let d = DateTime.now().setZone('Asia/Amman').plus({ days: 2 });
  while (d.weekday !== weekday) d = d.plus({ days: 1 });
  return d.toISODate()!;
}

describe('pricing', () => {
  let t: TestApp;
  let owner: string;
  let staff: string;
  let outsider: string;
  let venueId: string;
  let slug: string;
  let court: string;
  const thursday = nextWeekday(4);
  const friday = DateTime.fromISO(thursday).plus({ days: 1 }).toISODate()!;

  beforeAll(async () => {
    t = await createTestApp();
    const admin = (await signInAdmin(t.app)).cookie;
    const fx = await catalogFixture(t.app);
    const org = await createOrganization(t.app, admin);
    slug = `pricing-${Date.now()}`;
    venueId = (
      (
        await call(t.app, {
          method: 'POST',
          url: `/v1/admin/organizations/${org.id}/venues`,
          cookie: admin,
          body: { slug, name: { en: 'Pricing Club' }, governorateId: fx.governorateId },
        })
      ).json() as { id: string }
    ).id;
    court = (
      (
        await call(t.app, {
          method: 'POST',
          url: `/v1/admin/venues/${venueId}/resources`,
          cookie: admin,
          body: {
            name: { en: 'Court' },
            resourceTypeId: fx.types.padel_court!.id,
            sportFormatIds: [fx.formats['padel.doubles']],
          },
        })
      ).json() as { resources: Array<{ id: string }> }
    ).resources[0]!.id;
    await call(t.app, {
      method: 'POST',
      url: `/v1/admin/venues/${venueId}/status`,
      cookie: admin,
      body: { status: 'approved', reason: 'Pricing test' },
    });
    owner = (await signInPlayer(t.app, { phone: org.ownerPhone })).cookie;
    const staffPhone = randomPhone();
    await call(t.app, {
      method: 'POST',
      url: `/v1/admin/organizations/${org.id}/members`,
      cookie: admin,
      body: { phone: staffPhone, displayName: 'S', role: 'staff' },
    });
    staff = (await signInPlayer(t.app, { phone: staffPhone })).cookie;
    outsider = (
      await signInPlayer(t.app, { phone: (await createOrganization(t.app, admin)).ownerPhone })
    ).cookie;

    // Open 16:00–24:00 every day; 60 and 90 minute bookings every 30 minutes.
    await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/resources/${court}/weekly-hours`,
      cookie: owner,
      body: {
        windows: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
          dayOfWeek: d,
          startMinute: 960,
          durationMinutes: 480,
        })),
      },
    });
    await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/resources/${court}/policy`,
      cookie: owner,
      body: {
        slotDurations: [60, 90],
        startAlignmentMinutes: 30,
        minLeadMinutes: 0,
        maxAdvanceDays: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
    });
  });
  afterAll(async () => {
    await t?.close();
  });

  const createRule = (rule: object, cookie = owner) =>
    call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/pricing`,
      cookie,
      body: { resourceIds: [court], rule },
    });

  async function priceAt(
    date: string,
    localStart: string,
    duration: number,
  ): Promise<number | null> {
    const r = (
      await call(t.app, { method: 'GET', url: `/v1/venues/${slug}/availability?date=${date}` })
    ).json() as {
      resources: Array<{
        slots: Array<{
          localStart: string;
          durationMinutes: number;
          price: { amount: number; currency: string };
        }>;
      }>;
    };
    const slot = r.resources[0]!.slots.find(
      (s) => s.localStart === localStart && s.durationMinutes === duration,
    );
    return slot ? slot.price.amount : null;
  }

  it('shows no slots publicly until the venue sets prices', async () => {
    expect(await priceAt(thursday, '18:00', 60)).toBeNull();
  });

  it('prices slots by band, duration and start time; special periods win', async () => {
    const all = [1, 2, 3, 4, 5, 6, 7];
    expect(
      (
        await createRule({
          daysOfWeek: all,
          startMinute: 360,
          endMinute: 1800,
          amounts: [
            { durationMinutes: 60, amount: 20000 },
            { durationMinutes: 90, amount: 28000 },
          ],
        })
      ).statusCode,
    ).toBe(201);
    const peak = await createRule({
      daysOfWeek: all,
      startMinute: 18 * 60,
      endMinute: 23 * 60,
      priority: 10,
      label: 'Peak',
      amounts: [
        { durationMinutes: 60, amount: 30000 },
        { durationMinutes: 90, amount: 42000 },
      ],
    });
    const pricing = peak.json() as {
      currency: string;
      rules: Array<{ label: string | null; amounts: unknown[] }>;
    };
    expect(pricing.currency).toBe('JOD');
    expect(pricing.rules).toHaveLength(2);

    expect(await priceAt(thursday, '16:00', 60)).toBe(20000);
    expect(await priceAt(thursday, '18:00', 90)).toBe(42000);
    // Crossing the band boundary: priced by the band it starts in (ADR-0014).
    expect(await priceAt(thursday, '17:30', 90)).toBe(28000);
    expect(await priceAt(thursday, '22:30', 90)).toBe(42000);

    // Weekend (Friday) special price.
    await createRule({
      daysOfWeek: [5, 6],
      startMinute: 360,
      endMinute: 1800,
      priority: 20,
      amounts: [{ durationMinutes: 60, amount: 25000 }],
    });
    expect(await priceAt(friday, '16:00', 60)).toBe(25000);
    // The weekend band prices only 60 minutes; a 90-minute Friday booking falls back to the
    // regular band (a rule applies only to the durations it prices).
    expect(await priceAt(friday, '16:00', 90)).toBe(28000);
    expect(await priceAt(thursday, '16:00', 60)).toBe(20000);

    // Special period (e.g. a holiday) wins even with lower priority.
    await createRule({
      daysOfWeek: all,
      startMinute: 360,
      endMinute: 1800,
      dateFrom: thursday,
      dateTo: thursday,
      priority: -10,
      amounts: [{ durationMinutes: 60, amount: 15000 }],
    });
    expect(await priceAt(thursday, '19:00', 60)).toBe(15000);
  });

  it('previews prices for staff and archives instead of editing', async () => {
    const preview = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/resources/${court}/quote?date=${friday}&startTime=19:00&durationMinutes=60`,
      cookie: staff,
    });
    expect(preview.json()).toMatchObject({ price: { amount: 25000, currency: 'JOD' } });

    const pricing = (
      await call(t.app, {
        method: 'GET',
        url: `/v1/manage/venues/${venueId}/pricing`,
        cookie: owner,
      })
    ).json() as {
      rules: Array<{ id: string; label: string | null }>;
    };
    const peak = pricing.rules.find((r) => r.label === 'Peak')!;
    const replaced = await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/price-rules/${peak.id}`,
      cookie: owner,
      body: {
        rule: {
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          startMinute: 1080,
          endMinute: 1380,
          priority: 10,
          label: 'Peak',
          amounts: [{ durationMinutes: 60, amount: 32000 }],
        },
      },
    });
    expect(replaced.statusCode).toBe(200);
    const archived = await t.ownerPool.query(
      'SELECT archived_at FROM pricing.price_rules WHERE id = $1',
      [peak.id],
    );
    expect(archived.rows[0].archived_at).not.toBeNull();
    // The old rule cannot be replaced again.
    const again = await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/price-rules/${peak.id}`,
      cookie: owner,
      body: {
        rule: {
          daysOfWeek: [1],
          startMinute: 1080,
          endMinute: 1380,
          amounts: [{ durationMinutes: 60, amount: 1 }],
        },
      },
    });
    expect(again.statusCode).toBe(409);
  });

  it('validates bands', async () => {
    for (const rule of [
      {
        daysOfWeek: [],
        startMinute: 0,
        endMinute: 60,
        amounts: [{ durationMinutes: 60, amount: 1 }],
      },
      {
        daysOfWeek: [1],
        startMinute: 600,
        endMinute: 500,
        amounts: [{ durationMinutes: 60, amount: 1 }],
      },
      {
        daysOfWeek: [1],
        startMinute: 0,
        endMinute: 2000,
        amounts: [{ durationMinutes: 60, amount: 1 }],
      },
      {
        daysOfWeek: [1],
        startMinute: 0,
        endMinute: 60,
        amounts: [{ durationMinutes: 60, amount: -1 }],
      },
      {
        daysOfWeek: [1],
        startMinute: 0,
        endMinute: 60,
        dateFrom: thursday,
        amounts: [{ durationMinutes: 60, amount: 1 }],
      },
    ]) {
      expect((await createRule(rule)).statusCode).toBe(400);
    }
  });

  it('enforces roles and tenant isolation', async () => {
    const rule = {
      daysOfWeek: [1],
      startMinute: 600,
      endMinute: 700,
      amounts: [{ durationMinutes: 60, amount: 1 }],
    };
    expect((await createRule(rule, staff)).statusCode).toBe(403);
    expect((await createRule(rule, outsider)).statusCode).toBe(404);
    expect(
      (
        await call(t.app, {
          method: 'GET',
          url: `/v1/manage/venues/${venueId}/pricing`,
          cookie: outsider,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(t.app, {
          method: 'GET',
          url: `/v1/manage/resources/${court}/quote?date=${thursday}&startTime=19:00&durationMinutes=60`,
          cookie: outsider,
        })
      ).statusCode,
    ).toBe(404);
  });
});
