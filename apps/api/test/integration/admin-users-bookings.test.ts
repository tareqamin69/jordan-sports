import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bookableVenue,
  call,
  createTestApp,
  randomPhone,
  signInAdmin,
  signInPlayer,
  type TestApp,
  payBooking,
} from '../support/app.js';

/** Users (profile, reliability, suspend/ban) and bookings (search, detail, cancel). */
describe('admin users and bookings', () => {
  let t: TestApp;
  const staff: Record<string, { cookie: string; userId: string }> = {};
  let venue: Awaited<ReturnType<typeof bookableVenue>>;
  let player: { cookie: string; userId: string };
  const phone = randomPhone();
  let bookingId = '';
  let reference = '';

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    for (const role of ['owner', 'admin', 'support', 'finance'] as const) {
      staff[role] = await signInAdmin(t.app, role);
    }
    venue = await bookableVenue(t.app, staff.admin!.cookie);
    player = await signInPlayer(t.app, { phone });
    const date = DateTime.now().setZone('Asia/Amman').plus({ days: 1 }).toISODate();
    const slot = (
      (
        await call(t.app, {
          method: 'GET',
          url: `/v1/venues/${venue.slug}/availability?date=${date}`,
        })
      ).json() as { resources: Array<{ slots: Array<{ start: string }> }> }
    ).resources[0]!.slots[0]!;
    const held = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie: player.cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: venue.resourceId, start: slot.start, durationMinutes: 60 },
    });
    ({ id: bookingId, reference } = held.json() as { id: string; reference: string });
    const confirmed = await payBooking(t.app, player.cookie, bookingId);
    expect(confirmed.statusCode, confirmed.body).toBe(200);
  });
  afterAll(async () => {
    await t?.close();
  });

  const get = (cookie: string, url: string) => call(t.app, { method: 'GET', url, cookie });

  it('shows a user profile with reliability signals', async () => {
    const r = await get(staff.support!.cookie, `/v1/admin/users/${player.userId}`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      phone,
      status: 'active',
      reliability: { bookings: 1, noShows: 0, cancelled: 0 },
      complaints: 0,
    });
  });

  it('searches bookings by reference, phone, status and dates', async () => {
    const today = DateTime.now().setZone('Asia/Amman');
    const find = async (query: string) =>
      (
        (await get(staff.finance!.cookie, `/v1/admin/bookings?${query}`)).json() as {
          items: Array<{ id: string }>;
        }
      ).items.map((i) => i.id);
    expect(await find(`q=${reference}`)).toEqual([bookingId]);
    expect(await find(`q=${encodeURIComponent(phone.slice(-7))}`)).toContain(bookingId);
    expect(await find('status=CONFIRMED')).toContain(bookingId);
    expect(await find('status=CANCELLED')).not.toContain(bookingId);
    expect(await find(`from=${today.plus({ days: 3 }).toISODate()}`)).not.toContain(bookingId);
    expect(await find(`userId=${player.userId}`)).toEqual([bookingId]);
  });

  it('support cancels with a reason; finance cannot', async () => {
    const url = `/v1/admin/bookings/${bookingId}/cancel`;
    expect(
      (
        await call(t.app, {
          method: 'POST',
          url,
          cookie: staff.finance!.cookie,
          body: { reason: 'Test' },
        })
      ).statusCode,
    ).toBe(403);
    const r = await call(t.app, {
      method: 'POST',
      url,
      cookie: staff.support!.cookie,
      body: { reason: 'Venue flooded' },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({
      status: 'CANCELLED',
      cancelledBy: 'admin',
      cancelReason: 'Venue flooded',
    });
    const detail = (await get(staff.support!.cookie, `/v1/admin/bookings/${bookingId}`)).json() as {
      history: Array<{ to: string; actorType: string; reason: string | null }>;
    };
    expect(detail.history.at(-1)).toMatchObject({
      to: 'CANCELLED',
      actorType: 'admin',
      reason: 'Venue flooded',
    });
    // The player's own view says so too.
    const mine = await get(player.cookie, `/v1/bookings/${bookingId}`);
    expect(mine.json()).toMatchObject({ status: 'CANCELLED', cancelledBy: 'admin' });
  });

  it('bans a user (sessions end, sign-in refused) but never platform staff', async () => {
    const other = await signInPlayer(t.app);
    const set = (cookie: string, userId: string, status: string) =>
      call(t.app, {
        method: 'POST',
        url: `/v1/admin/users/${userId}/status`,
        cookie,
        body: { status, reason: 'Repeated no-shows' },
      });
    expect((await set(staff.support!.cookie, other.userId, 'banned')).statusCode).toBe(403);
    const banned = await set(staff.admin!.cookie, other.userId, 'banned');
    expect(banned.json()).toMatchObject({ status: 'banned' });
    expect((await get(other.cookie, '/v1/me')).statusCode).toBe(401);
    // Admins cannot touch staff accounts (the owner included) from the users page.
    expect((await set(staff.admin!.cookie, staff.owner!.userId, 'suspended')).statusCode).toBe(403);
    expect((await set(staff.admin!.cookie, staff.support!.userId, 'banned')).statusCode).toBe(403);
  });
});
