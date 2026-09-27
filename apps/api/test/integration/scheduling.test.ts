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

/** The next given ISO weekday in Amman, at least 2 days from now. */
function nextWeekday(weekday: number): string {
  let d = DateTime.now().setZone('Asia/Amman').plus({ days: 2 });
  while (d.weekday !== weekday) d = d.plus({ days: 1 });
  return d.toISODate()!;
}

describe('scheduling: hours, blocks, overrides, availability, calendar', () => {
  let t: TestApp;
  let admin: string;
  let owner: string;
  let staff: string;
  let outsider: string;
  let venueId: string;
  let slug: string;
  let halfA: string;
  let halfB: string;
  let full: string;
  const thursday = nextWeekday(4);

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await signInAdmin(t.app)).cookie;
    const fx = await catalogFixture(t.app);
    const org = await createOrganization(t.app, admin);

    slug = `sched-${Date.now()}`;
    const venue = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/organizations/${org.id}/venues`,
      cookie: admin,
      body: { slug, name: { en: 'Scheduling Arena' }, cityId: fx.cityId },
    });
    venueId = (venue.json() as { id: string }).id;
    const add = async (name: string, extra: object = {}) =>
      (
        await call(t.app, {
          method: 'POST',
          url: `/v1/admin/venues/${venueId}/resources`,
          cookie: admin,
          body: {
            name: { en: name },
            resourceTypeId: fx.types.football_pitch!.id,
            sportFormatIds: [fx.formats['football.five_a_side']],
            ...extra,
          },
        })
      ).json() as { resources: Array<{ id: string; name: { en: string } }> };
    await add('Half A');
    const r = await add('Half B');
    halfA = r.resources.find((x) => x.name.en === 'Half A')!.id;
    halfB = r.resources.find((x) => x.name.en === 'Half B')!.id;
    const withFull = await add('Full', { combinesResourceIds: [halfA, halfB] });
    full = withFull.resources.find((x) => x.name.en === 'Full')!.id;
    await call(t.app, {
      method: 'POST',
      url: `/v1/admin/venues/${venueId}/status`,
      cookie: admin,
      body: { status: 'approved', reason: 'Scheduling test' },
    });

    owner = (await signInPlayer(t.app, { phone: org.ownerPhone })).cookie;
    const staffPhone = randomPhone();
    await call(t.app, {
      method: 'POST',
      url: `/v1/admin/organizations/${org.id}/members`,
      cookie: admin,
      body: { phone: staffPhone, displayName: 'Staff', role: 'staff' },
    });
    staff = (await signInPlayer(t.app, { phone: staffPhone })).cookie;

    const otherOrg = await createOrganization(t.app, admin);
    outsider = (await signInPlayer(t.app, { phone: otherOrg.ownerPhone })).cookie;

    // Thursday 16:00–22:00 on every resource, 60-minute slots on the hour.
    for (const id of [halfA, halfB, full]) {
      const h = await call(t.app, {
        method: 'PUT',
        url: `/v1/manage/resources/${id}/weekly-hours`,
        cookie: owner,
        body: { windows: [{ dayOfWeek: 4, startMinute: 960, durationMinutes: 360 }] },
      });
      expect(h.statusCode).toBe(200);
      await call(t.app, {
        method: 'PUT',
        url: `/v1/manage/resources/${id}/policy`,
        cookie: owner,
        body: {
          slotDurations: [60],
          startAlignmentMinutes: 60,
          minLeadMinutes: 0,
          maxAdvanceDays: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        },
      });
    }
    // Public availability only lists priced slots: one base price for the whole business day.
    const priced = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/pricing`,
      cookie: owner,
      body: {
        resourceIds: [halfA, halfB, full],
        rule: {
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          startMinute: 360,
          endMinute: 1800,
          amounts: [{ durationMinutes: 60, amount: 20000 }],
        },
      },
    });
    expect(priced.statusCode).toBe(201);
  });

  afterAll(async () => {
    await t?.close();
  });

  async function slots(resourceId: string, date = thursday) {
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/venues/${slug}/availability?date=${date}`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      timezone: string;
      resources: Array<{
        resourceId: string;
        slots: Array<{ localStart: string; available: boolean }>;
      }>;
    };
    expect(body.timezone).toBe('Asia/Amman');
    return body.resources.find((x) => x.resourceId === resourceId)!.slots;
  }

  const taken = async (id: string) =>
    (await slots(id)).filter((s) => !s.available).map((s) => s.localStart);

  it('lists managed venues for members only', async () => {
    const mine = (
      await call(t.app, { method: 'GET', url: '/v1/manage/venues', cookie: owner })
    ).json() as { items: Array<{ id: string; role: string }> };
    expect(mine.items).toEqual([expect.objectContaining({ id: venueId, role: 'owner' })]);
    const theirs = (
      await call(t.app, { method: 'GET', url: '/v1/manage/venues', cookie: outsider })
    ).json() as { items: unknown[] };
    expect(theirs.items).toEqual([]);
  });

  it('publishes opening hours as bookable slots in venue-local time', async () => {
    expect((await slots(halfA)).map((s) => s.localStart)).toEqual([
      '16:00',
      '17:00',
      '18:00',
      '19:00',
      '20:00',
      '21:00',
    ]);
  });

  it('rejects overlapping opening windows', async () => {
    const r = await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/resources/${halfA}/weekly-hours`,
      cookie: owner,
      body: {
        windows: [
          { dayOfWeek: 4, startMinute: 960, durationMinutes: 360 },
          { dayOfWeek: 4, startMinute: 1200, durationMinutes: 60 },
        ],
      },
    });
    expect(r.statusCode).toBe(400);
  });

  it('blocks time immediately: the half and the full pitch lose the slot, the other half keeps it', async () => {
    const block = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/blocks`,
      cookie: staff,
      body: {
        resourceId: halfA,
        date: thursday,
        startTime: '18:00',
        durationMinutes: 60,
        reason: 'external_booking',
        note: 'Phone booking: Ahmad',
      },
    });
    expect(block.statusCode).toBe(201);
    const { blockId } = block.json() as { blockId: string };
    expect(await taken(halfA)).toEqual(['18:00']);
    expect(await taken(full)).toEqual(['18:00']);
    expect(await taken(halfB)).toEqual([]);

    // Blocking the full pitch over the blocked half is rejected by the database constraint.
    const conflict = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/blocks`,
      cookie: owner,
      body: {
        resourceId: full,
        date: thursday,
        startTime: '17:30',
        durationMinutes: 60,
        reason: 'maintenance',
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: 'SCHEDULE_CONFLICT' });

    // The calendar shows the block on the half and, via the shared unit, on the full pitch.
    const cal = (
      await call(t.app, {
        method: 'GET',
        url: `/v1/manage/venues/${venueId}/calendar?date=${thursday}`,
        cookie: staff,
      })
    ).json() as {
      resources: Array<{
        id: string;
        entries: Array<{
          blockId: string;
          reason: string;
          note: string;
          viaResourceId: string | null;
          localStart: string;
        }>;
        open: Array<{ localStart: string; localEnd: string }>;
      }>;
    };
    const calA = cal.resources.find((r) => r.id === halfA)!;
    const calFull = cal.resources.find((r) => r.id === full)!;
    expect(calA.open).toEqual([
      expect.objectContaining({ localStart: '16:00', localEnd: '22:00' }),
    ]);
    expect(calA.entries).toEqual([
      expect.objectContaining({
        blockId,
        reason: 'external_booking',
        note: 'Phone booking: Ahmad',
        viaResourceId: null,
        localStart: '18:00',
      }),
    ]);
    expect(calFull.entries).toEqual([expect.objectContaining({ blockId, viaResourceId: halfA })]);

    // Removing the block frees the time.
    const cancel = await call(t.app, {
      method: 'DELETE',
      url: `/v1/manage/blocks/${blockId}`,
      cookie: staff,
    });
    expect(cancel.statusCode).toBe(200);
    expect(await taken(halfA)).toEqual([]);
    expect(await taken(full)).toEqual([]);
  });

  it('allows exactly one of 20 simultaneous blocks for the same time (database guarantee)', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        call(t.app, {
          method: 'POST',
          url: `/v1/manage/venues/${venueId}/blocks`,
          cookie: owner,
          body: {
            resourceId: i % 2 === 0 ? full : halfB,
            date: thursday,
            startTime: '20:00',
            durationMinutes: 60,
            reason: 'private_event',
          },
        }),
      ),
    );
    const codes = attempts.map((a) => a.statusCode);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(19);
    const active = await t.ownerPool.query(
      `SELECT count(DISTINCT block_id)::int AS n FROM scheduling.occupancies WHERE venue_id = $1 AND active AND kind = 'block'
         AND during && tstzrange($2::timestamptz, $3::timestamptz)`,
      [venueId, `${thursday}T20:00:00+03:00`, `${thursday}T21:00:00+03:00`],
    );
    expect(active.rows[0].n).toBe(1);
  });

  it('closes a day with an override and reopens it when removed', async () => {
    const created = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/overrides`,
      cookie: owner,
      body: { dateFrom: thursday, dateTo: thursday, kind: 'closed', note: 'Pitch resurfacing' },
    });
    expect(created.statusCode).toBe(201);
    expect(await slots(halfA)).toEqual([]);
    const overrideId = (created.json() as { overrides: Array<{ id: string }> }).overrides[0]!.id;
    await call(t.app, {
      method: 'DELETE',
      url: `/v1/manage/overrides/${overrideId}`,
      cookie: owner,
    });
    expect((await slots(halfA)).length).toBe(6);
  });

  it('special hours replace the weekly hours for a date range', async () => {
    const created = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/overrides`,
      cookie: owner,
      body: {
        resourceId: halfB,
        dateFrom: thursday,
        dateTo: thursday,
        kind: 'hours',
        windows: [{ startMinute: 1260, durationMinutes: 180 }],
      },
    });
    // 21:00–00:00, still Thursday's business day.
    expect((await slots(halfB)).map((s) => s.localStart)).toEqual(['21:00', '22:00', '23:00']);
    const id = (
      created.json() as { overrides: Array<{ id: string; resourceId: string | null }> }
    ).overrides.find((o) => o.resourceId === halfB)!.id;
    await call(t.app, { method: 'DELETE', url: `/v1/manage/overrides/${id}`, cookie: owner });
  });

  it('closes on public holidays only when the venue opts in', async () => {
    const holiday = await call(t.app, {
      method: 'POST',
      url: '/v1/admin/holidays',
      cookie: admin,
      body: { countryCode: 'JO', date: thursday, name: { en: 'Test holiday', ar: 'عطلة تجريبية' } },
    });
    expect(holiday.statusCode).toBe(201);
    expect((await slots(halfA)).length).toBe(6);
    await call(t.app, {
      method: 'PATCH',
      url: `/v1/manage/venues/${venueId}/settings`,
      cookie: owner,
      body: { closedOnPublicHolidays: true },
    });
    expect(await slots(halfA)).toEqual([]);
    await call(t.app, {
      method: 'PATCH',
      url: `/v1/manage/venues/${venueId}/settings`,
      cookie: owner,
      body: { closedOnPublicHolidays: false },
    });
  });

  it('enforces roles: staff can block time but cannot change hours or rules', async () => {
    const hours = await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/resources/${halfA}/weekly-hours`,
      cookie: staff,
      body: { windows: [] },
    });
    expect(hours.statusCode).toBe(403);
    const schedule = (
      await call(t.app, {
        method: 'GET',
        url: `/v1/manage/venues/${venueId}/schedule`,
        cookie: staff,
      })
    ).json() as {
      role: string;
      permissions: string[];
    };
    expect(schedule.role).toBe('staff');
    expect(schedule.permissions).toContain('schedule.block');
    expect(schedule.permissions).not.toContain('schedule.manage');
  });

  it('isolates tenants: another organization gets 404 on every venue-scoped endpoint', async () => {
    const block = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/blocks`,
      cookie: owner,
      body: {
        resourceId: halfB,
        date: thursday,
        startTime: '16:00',
        durationMinutes: 60,
        reason: 'maintenance',
      },
    });
    const { blockId } = block.json() as { blockId: string };
    const requests: Array<{
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      url: string;
      body?: object;
    }> = [
      { method: 'GET', url: `/v1/manage/venues/${venueId}/schedule` },
      { method: 'GET', url: `/v1/manage/venues/${venueId}/calendar?date=${thursday}` },
      { method: 'PUT', url: `/v1/manage/resources/${halfA}/weekly-hours`, body: { windows: [] } },
      {
        method: 'PUT',
        url: `/v1/manage/resources/${halfA}/policy`,
        body: {
          slotDurations: [60],
          startAlignmentMinutes: 60,
          minLeadMinutes: 0,
          maxAdvanceDays: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        },
      },
      {
        method: 'PATCH',
        url: `/v1/manage/venues/${venueId}/settings`,
        body: { closedOnPublicHolidays: true },
      },
      {
        method: 'POST',
        url: `/v1/manage/venues/${venueId}/overrides`,
        body: { dateFrom: thursday, dateTo: thursday, kind: 'closed' },
      },
      {
        method: 'POST',
        url: `/v1/manage/venues/${venueId}/blocks`,
        body: {
          resourceId: halfA,
          date: thursday,
          startTime: '21:00',
          durationMinutes: 60,
          reason: 'other',
        },
      },
      { method: 'DELETE', url: `/v1/manage/blocks/${blockId}` },
    ];
    for (const r of requests) {
      const res = await call(t.app, { ...r, cookie: outsider });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(404);
    }
    // Nothing changed.
    expect(await taken(halfB)).toContain('16:00');
  });
});
