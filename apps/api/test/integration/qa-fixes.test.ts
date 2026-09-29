import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bookableVenue,
  call,
  catalogFixture,
  createTestApp,
  randomPhone,
  signInAdmin,
  type TestApp,
} from '../support/app.js';

/** Regression tests for the QA pass on staging (items are numbered like the QA report). */
describe('QA fixes', () => {
  let t: TestApp;
  let owner: string;
  let admin: string;
  let venue: Awaited<ReturnType<typeof bookableVenue>>;

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    owner = (await signInAdmin(t.app, 'owner')).cookie;
    admin = (await signInAdmin(t.app, 'admin')).cookie;
    venue = await bookableVenue(t.app, admin);
  });
  afterAll(async () => {
    await t?.close();
  });

  const send = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    cookie?: string,
    body?: unknown,
  ) =>
    call(t.app, {
      method,
      url,
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { body } : {}),
    });

  describe('#1 team roles', () => {
    const add = (role: string | undefined, confirmOwner?: boolean) =>
      send('POST', `/v1/manage/venues/${venue.venueId}/team`, venue.ownerCookie, {
        phone: `0${randomPhone().slice(4)}`,
        displayName: 'Someone',
        ...(role ? { role } : {}),
        ...(confirmOwner !== undefined ? { confirmOwner } : {}),
      });

    it('defaults to front-desk staff', async () => {
      const r = await add(undefined);
      expect(r.statusCode, r.body).toBe(201);
      const members = (r.json() as { members: Array<{ displayName: string; role: string }> })
        .members;
      expect(members.find((m) => m.displayName === 'Someone')!.role).toBe('staff');
    });

    it('needs an explicit confirmation for the owner role', async () => {
      expect((await add('owner')).statusCode).toBe(400);
      expect((await add('owner', false)).statusCode).toBe(400);
      expect((await add('owner', true)).statusCode).toBe(201);
      const team = (
        await send('GET', `/v1/manage/venues/${venue.venueId}/team`, venue.ownerCookie)
      ).json() as { members: Array<{ memberId: string; role: string; isYou: boolean }> };
      const staff = team.members.find((m) => m.role === 'staff')!;
      const url = `/v1/manage/members/${staff.memberId}`;
      expect((await send('PUT', url, venue.ownerCookie, { role: 'owner' })).statusCode).toBe(400);
      expect(
        (await send('PUT', url, venue.ownerCookie, { role: 'owner', confirmOwner: true }))
          .statusCode,
      ).toBe(200);
    });
  });

  it('#2 players and owners read the same booking window (default 14 days)', async () => {
    const pub = async () =>
      (await send('GET', `/v1/venues/${venue.slug}`)).json() as { bookingWindowDays: number };
    // A new court gets the stored default of 14 days; this venue's helper set 30.
    expect((await pub()).bookingWindowDays).toBe(30);
    const fresh = await t.ownerPool.query<{ d: number }>(
      `SELECT column_default::int AS d FROM information_schema.columns
        WHERE table_schema = 'resource' AND table_name = 'booking_policies' AND column_name = 'max_advance_days'`,
    );
    expect(fresh.rows[0]!.d).toBe(14);
    await t.ownerPool.query(
      `UPDATE resource.booking_policies SET max_advance_days = 21 WHERE resource_id = $1`,
      [venue.resourceId],
    );
    expect((await pub()).bookingWindowDays).toBe(21);
    const schedule = (
      await send('GET', `/v1/manage/venues/${venue.venueId}/schedule`, venue.ownerCookie)
    ).json() as { resources: Array<{ policy: { maxAdvanceDays: number } }> };
    expect(schedule.resources[0]!.policy.maxAdvanceDays).toBe(21);
  });

  describe('#6 owner edits, photos and the review setting', () => {
    const patch = (body: unknown) =>
      send('PATCH', `/v1/manage/venues/${venue.venueId}`, venue.ownerCookie, body);
    const status = async () =>
      (await t.ownerPool.query('SELECT status FROM venue.venues WHERE id = $1', [venue.venueId]))
        .rows[0].status as string;

    it('edits details without wiping amenities, and stays published by default', async () => {
      const fx = await catalogFixture(t.app);
      const first = await patch({
        description: { ar: 'وصف', en: 'About' },
        amenityIds: fx.amenityIds.slice(0, 2),
      });
      expect(first.statusCode, first.body).toBe(200);
      const renamed = await patch({
        name: { ar: 'اسم جديد', en: 'New name' },
        whatsapp: '0791234567',
      });
      expect(renamed.statusCode, renamed.body).toBe(200);
      expect(renamed.json()).toMatchObject({
        name: { en: 'New name' },
        whatsapp: expect.stringMatching(/^\+962/),
        amenityIds: expect.arrayContaining(fx.amenityIds.slice(0, 2)),
      });
      expect(await status()).toBe('approved');
    });

    it('sends the venue back to review only when the platform setting asks for it', async () => {
      const set = (on: boolean) =>
        send('PATCH', '/v1/admin/settings', owner, { venueEditsNeedReview: on });
      expect((await set(true)).json()).toMatchObject({ venueEditsNeedReview: true });
      // Other details do not trigger a review; a new name does.
      await patch({ contactPhone: '0797654321' });
      expect(await status()).toBe('approved');
      await patch({ name: { ar: 'اسم آخر', en: 'Another name' } });
      expect(await status()).toBe('submitted');
      expect((await send('GET', `/v1/venues/${venue.slug}`)).statusCode).toBe(404);
      await t.ownerPool.query(`UPDATE venue.venues SET status = 'approved' WHERE id = $1`, [
        venue.venueId,
      ]);
      await set(false);
      await patch({ name: { ar: 'اسم ثالث', en: 'Third name' } });
      expect(await status()).toBe('approved');
    });

    it('reorders photos: the first one becomes the cover', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const id = randomUUID();
        await t.ownerPool.query(
          `INSERT INTO venue.media (id, venue_id, storage_key, content_type, width, height, byte_size, sort_order)
           VALUES ($1, $2, $3, 'image/webp', 10, 10, 100, $4)`,
          [id, venue.venueId, `${venue.venueId}/${id}.webp`, i],
        );
        ids.push(id);
      }
      const url = `/v1/manage/venues/${venue.venueId}/media/order`;
      const reversed = [...ids].reverse();
      const r = await send('PUT', url, venue.ownerCookie, { mediaIds: reversed });
      expect(r.statusCode, r.body).toBe(200);
      expect((r.json() as { media: Array<{ id: string }> }).media.map((m) => m.id)).toEqual(
        reversed,
      );
      // Must list each photo exactly once.
      expect(
        (await send('PUT', url, venue.ownerCookie, { mediaIds: ids.slice(1) })).statusCode,
      ).toBe(400);
      expect(
        (await send('PUT', url, venue.ownerCookie, { mediaIds: [...ids, ids[0]] })).statusCode,
      ).toBe(400);
    });
  });

  it('#10 the audit log names its targets', async () => {
    const list = (
      await send('GET', '/v1/admin/audit-logs?targetType=venue&limit=50', admin)
    ).json() as {
      items: Array<{ targetId: string; targetName: { ar?: string; en?: string } | null }>;
    };
    const mine = list.items.find((i) => i.targetId === venue.venueId);
    expect(mine?.targetName).toBeTruthy();
    expect(Object.values(mine!.targetName!).length).toBeGreaterThan(0);
  });

  it('#12 the review summary lists hours and prices per court', async () => {
    const r = await send('GET', `/v1/admin/venues/${venue.venueId}/review-summary`, admin);
    expect(r.statusCode, r.body).toBe(200);
    const court = (
      r.json() as {
        resources: Array<{
          weeklyHours: unknown[];
          prices: Array<{ amounts: Array<{ amount: number }> }>;
        }>;
      }
    ).resources[0]!;
    expect(court.weeklyHours).toHaveLength(7);
    expect(court.prices[0]!.amounts[0]!.amount).toBe(20_000);
  });

  it('#13 official holidays are seeded for this and next year and stay editable', async () => {
    const list = (await send('GET', '/v1/admin/holidays?country=JO', admin)).json() as {
      items: Array<{ date: string }>;
    };
    const dates = list.items.map((h) => h.date);
    for (const d of ['2026-05-25', '2026-12-25', '2027-01-01', '2027-05-25'])
      expect(dates).toContain(d);
  });

  describe('#19 sports', () => {
    it('lists every sport for admins and lets the owner hide and show one', async () => {
      const list = async () =>
        (await send('GET', '/v1/admin/sports', owner)).json() as {
          items: Array<{ id: string; key: string; active: boolean; venueCount: number }>;
        };
      const sport = (await list()).items.find((s) => s.venueCount === 0)!;
      const inCatalog = async () =>
        (
          (await send('GET', '/v1/catalog')).json() as { sports: Array<{ key: string }> }
        ).sports.map((s) => s.key);
      expect(await inCatalog()).toContain(sport.key);
      expect((await send('GET', '/v1/admin/sports', admin)).statusCode).toBe(403);
      const hide = await send('PATCH', `/v1/admin/sports/${sport.id}`, owner, { active: false });
      expect(hide.statusCode, hide.body).toBe(200);
      expect(await inCatalog()).not.toContain(sport.key);
      expect((await list()).items.find((s) => s.id === sport.id)!.active).toBe(false);
      await send('PATCH', `/v1/admin/sports/${sport.id}`, owner, { active: true });
      expect(await inCatalog()).toContain(sport.key);
    });
  });
});
