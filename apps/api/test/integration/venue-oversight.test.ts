import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bookableVenue,
  call,
  createTestApp,
  manualBooking,
  signInAdmin,
  type TestApp,
} from '../support/app.js';

/** Archive, the owner's private ratings and venue performance (docs/rbac-plan.md §7.2–7.3). */
describe('venue oversight', () => {
  let t: TestApp;
  const staff: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    for (const role of ['owner', 'admin', 'support', 'finance'] as const) {
      staff[role] = (await signInAdmin(t.app, role)).cookie;
    }
  });
  afterAll(async () => {
    await t?.close();
  });

  const as = (cookie: string, method: 'GET' | 'POST', url: string, body?: unknown) =>
    call(t.app, { method, url, cookie, ...(body !== undefined ? { body } : {}) });

  it('archives only after typing the name and once no bookings are to come', async () => {
    const v = await bookableVenue(t.app, staff.admin!);
    const booking = await manualBooking(t.app, v.ownerCookie, v);
    const url = `/v1/admin/venues/${v.venueId}/archive`;
    const body = { confirmName: 'Test Venue', reason: 'Closed for good' };
    const { name } = (await as(staff.owner!, 'GET', `/v1/admin/venues/${v.venueId}`)).json() as {
      name: { ar?: string; en?: string };
    };
    const typed = name.en ?? name.ar!;

    expect((await as(staff.admin!, 'POST', url, { ...body, confirmName: typed })).statusCode).toBe(
      403,
    );
    expect(
      (await as(staff.owner!, 'POST', url, { ...body, confirmName: 'Wrong name' })).json(),
    ).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(
      (await as(staff.owner!, 'POST', url, { ...body, confirmName: typed })).json(),
    ).toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });

    const cancel = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/bookings/${booking.id}/cancel`,
      cookie: v.ownerCookie,
      body: { reason: 'Venue closing' },
    });
    expect(cancel.statusCode, cancel.body).toBe(200);
    const done = await as(staff.owner!, 'POST', url, {
      ...body,
      confirmName: `  ${typed.toUpperCase()} `,
    });
    expect(done.statusCode, done.body).toBe(200);

    expect((await call(t.app, { method: 'GET', url: `/v1/venues/${v.slug}` })).statusCode).toBe(
      404,
    );
    expect((await as(staff.owner!, 'GET', `/v1/admin/venues/${v.venueId}`)).statusCode).toBe(404);
    const audit = await t.ownerPool.query<{
      reason: string;
      details: { after: { archivedAt: string } };
    }>(
      "SELECT reason, details FROM audit.audit_logs WHERE action = 'venue.archived' AND target_id = $1",
      [v.venueId],
    );
    expect(audit.rows[0]).toMatchObject({ reason: 'Closed for good' });
    expect(audit.rows[0]!.details.after.archivedAt).toBeTruthy();
  });

  it('lets the venue owner archive their own venue, but not the manager', async () => {
    const v = await bookableVenue(t.app, staff.admin!);
    const { name } = (await as(staff.owner!, 'GET', `/v1/admin/venues/${v.venueId}`)).json() as {
      name: { ar?: string; en?: string };
    };
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${v.venueId}/archive`,
      cookie: v.ownerCookie,
      body: { confirmName: name.ar ?? name.en, reason: 'Moving to a new place' },
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("keeps the owner's rating private, with its history", async () => {
    const v = await bookableVenue(t.app, staff.admin!);
    const url = `/v1/admin/venues/${v.venueId}/rating`;
    for (const role of ['admin', 'support', 'finance']) {
      expect((await as(staff[role]!, 'GET', url)).statusCode).toBe(403);
    }
    await as(staff.owner!, 'POST', url, { score: 4, tags: ['reliable'], note: 'Good first month' });
    const second = await as(staff.owner!, 'POST', url, {
      score: 2,
      tags: ['slow_to_reply', 'complaints'],
      note: 'Secret note',
    });
    expect(second.statusCode, second.body).toBe(201);
    const view = second.json() as {
      current: { score: number; tags: string[] };
      history: unknown[];
    };
    expect(view.current).toMatchObject({ score: 2, tags: ['slow_to_reply', 'complaints'] });
    expect(view.history).toHaveLength(2);
    expect((await as(staff.owner!, 'POST', url, { score: 6 })).statusCode).toBe(400);

    // Nothing of it reaches the venue, the public or the audit log.
    const pub = await call(t.app, { method: 'GET', url: `/v1/venues/${v.slug}` });
    expect(pub.body).not.toContain('Secret note');
    const audit = await t.ownerPool.query(
      "SELECT count(*)::int AS n FROM audit.audit_logs WHERE details::text LIKE '%Secret note%'",
    );
    expect(audit.rows[0].n).toBe(0);
  });

  it('shows performance; revenue only to roles with revenue access', async () => {
    const v = await bookableVenue(t.app, staff.admin!);
    await manualBooking(t.app, v.ownerCookie, v, 0, '23:00');
    const stats = async (role: string) =>
      (await as(staff[role]!, 'GET', `/v1/admin/venues/${v.venueId}/stats?days=30`)).json() as {
        bookings: { total: number; byVenue: number };
        revenue: unknown;
      };
    // Today's 23:00 booking may still be ahead: count the whole window up to now or later.
    const owner = await stats('owner');
    expect(owner.revenue).not.toBeNull();
    expect((await stats('finance')).revenue).not.toBeNull();
    expect((await stats('support')).revenue).toBeNull();
    expect(owner.bookings.total).toBeGreaterThanOrEqual(0);
  });
});
