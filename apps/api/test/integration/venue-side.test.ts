import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bookableVenue,
  call,
  createTestApp,
  manualBooking,
  randomPhone,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

/** Venue owners manage their team; the front desk records arrivals (docs/rbac-plan.md §3). */
describe('venue side', () => {
  let t: TestApp;
  let venue: Awaited<ReturnType<typeof bookableVenue>>;
  let other: Awaited<ReturnType<typeof bookableVenue>>;
  const people: Record<'manager' | 'staff', { cookie: string; phone: string }> = {} as never;

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    const admin = (await signInAdmin(t.app, 'admin')).cookie;
    venue = await bookableVenue(t.app, admin);
    other = await bookableVenue(t.app, admin);
    for (const role of ['manager', 'staff'] as const) {
      const phone = randomPhone();
      const added = await call(t.app, {
        method: 'POST',
        url: `/v1/manage/venues/${venue.venueId}/team`,
        cookie: venue.ownerCookie,
        body: { phone: `0${phone.slice(4)}`, displayName: role, role },
      });
      expect(added.statusCode, added.body).toBe(201);
      people[role] = { cookie: (await signInPlayer(t.app, { phone })).cookie, phone };
    }
  });
  afterAll(async () => {
    await t?.close();
  });

  const teamUrl = () => `/v1/manage/venues/${venue.venueId}/team`;
  type Team = { members: Array<{ memberId: string; role: string; isYou: boolean; phone: string }> };

  it('only the venue owner manages the team', async () => {
    const team = (
      await call(t.app, { method: 'GET', url: teamUrl(), cookie: venue.ownerCookie })
    ).json() as Team;
    expect(team.members.map((m) => m.role).sort()).toEqual(['manager', 'owner', 'staff']);
    expect(team.members.find((m) => m.isYou)!.role).toBe('owner');
    for (const who of ['manager', 'staff'] as const) {
      expect(
        (await call(t.app, { method: 'GET', url: teamUrl(), cookie: people[who].cookie }))
          .statusCode,
      ).toBe(403);
    }
    // Another organization's owner cannot see or touch these members.
    expect(
      (await call(t.app, { method: 'GET', url: teamUrl(), cookie: other.ownerCookie })).statusCode,
    ).toBe(404);
    const staffMember = team.members.find((m) => m.role === 'staff')!;
    expect(
      (
        await call(t.app, {
          method: 'DELETE',
          url: `/v1/manage/members/${staffMember.memberId}`,
          cookie: other.ownerCookie,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('changes roles, never your own, and removes members', async () => {
    const team = (
      await call(t.app, { method: 'GET', url: teamUrl(), cookie: venue.ownerCookie })
    ).json() as Team;
    const me = team.members.find((m) => m.isYou)!;
    const staff = team.members.find((m) => m.role === 'staff')!;
    const self = await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/members/${me.memberId}`,
      cookie: venue.ownerCookie,
      body: { role: 'manager' },
    });
    expect(self.statusCode).toBe(403);
    const promoted = await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/members/${staff.memberId}`,
      cookie: venue.ownerCookie,
      body: { role: 'manager' },
    });
    expect(promoted.statusCode, promoted.body).toBe(200);
    // The new role applies at once: a manager sees the calendar settings.
    const hours = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${venue.venueId}/schedule`,
      cookie: people.staff.cookie,
    });
    expect((hours.json() as { permissions: string[] }).permissions).toContain('schedule.hours');
    await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/members/${staff.memberId}`,
      cookie: venue.ownerCookie,
      body: { role: 'staff' },
    });
    const duplicate = await call(t.app, {
      method: 'POST',
      url: teamUrl(),
      cookie: venue.ownerCookie,
      body: { phone: people.staff.phone, displayName: 'Again', role: 'staff' },
    });
    expect(duplicate.json()).toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  it('front desk checks customers in or records a no-show', async () => {
    const shift = (id: string, fromMinutes: number, toMinutes: number) =>
      t.ownerPool.query(
        `UPDATE booking.bookings SET during = tstzrange(now() + make_interval(mins => $2), now() + make_interval(mins => $3))
          WHERE id = $1`,
        [id, fromMinutes, toMinutes],
      );
    const arriving = await manualBooking(t.app, venue.ownerCookie, venue, 3, '10:00');
    const absent = await manualBooking(t.app, venue.ownerCookie, venue, 3, '11:00');
    const later = await manualBooking(t.app, venue.ownerCookie, venue, 3, '12:00');
    await shift(arriving.id, -10, 50);
    await shift(absent.id, -30, 30);

    const post = (id: string, action: string, cookie = people.staff.cookie) =>
      call(t.app, { method: 'POST', url: `/v1/manage/bookings/${id}/${action}`, cookie });
    const checkedIn = await post(arriving.id, 'check-in');
    expect(checkedIn.statusCode, checkedIn.body).toBe(200);
    expect(checkedIn.json()).toMatchObject({ checkedInAt: expect.any(String), price: null });
    expect((await post(arriving.id, 'no-show')).statusCode).toBe(409);

    const noShow = await post(absent.id, 'no-show');
    expect(noShow.json()).toMatchObject({ status: 'NO_SHOW' });
    // Not before the start, and never for another venue's staff.
    expect((await post(later.id, 'no-show')).statusCode).toBe(409);
    expect((await post(later.id, 'check-in', other.ownerCookie)).statusCode).toBe(404);
  });

  it("shows the venue's figures to its owner only", async () => {
    const url = `/v1/manage/venues/${venue.venueId}/stats?days=30`;
    const owner = await call(t.app, { method: 'GET', url, cookie: venue.ownerCookie });
    expect(owner.statusCode).toBe(200);
    expect((owner.json() as { revenue: unknown }).revenue).not.toBeNull();
    expect(
      (await call(t.app, { method: 'GET', url, cookie: people.manager.cookie })).statusCode,
    ).toBe(403);
  });
});
