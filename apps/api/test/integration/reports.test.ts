import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csvField } from '../../src/platform/http/csv.js';
import {
  bookableVenue,
  call,
  createTestApp,
  manualBooking,
  signInAdmin,
  type TestApp,
} from '../support/app.js';

/** Dashboard figures, exports and the audit log viewer (docs/rbac-plan.md §7.1, §7.9). */
describe('reports and exports', () => {
  let t: TestApp;
  const staff: Record<string, { cookie: string; userId: string }> = {};

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    for (const role of ['owner', 'admin', 'support', 'finance'] as const) {
      staff[role] = await signInAdmin(t.app, role);
    }
    const venue = await bookableVenue(t.app, staff.admin!.cookie);
    await manualBooking(t.app, venue.ownerCookie, venue, 1, '18:00');
    await manualBooking(t.app, venue.ownerCookie, venue, 1, '19:00');
  });
  afterAll(async () => {
    await t?.close();
  });

  const get = (role: string, url: string) =>
    call(t.app, { method: 'GET', url, cookie: staff[role]!.cookie });

  it('shows the dashboard; revenue only to roles with revenue access', async () => {
    const owner = (await get('owner', '/v1/admin/reports/overview?period=week')).json() as {
      totals: { bookings: number; newVenues: number };
      revenue: { bookingValue: { amount: number } } | null;
      daily: Array<{ bookings: number; bookingValue: number | null }>;
      topVenues: Array<{ bookings: number }>;
    };
    expect(owner.totals.bookings).toBe(2);
    expect(owner.totals.newVenues).toBe(1);
    expect(owner.revenue!.bookingValue.amount).toBe(40_000);
    expect(owner.daily).toHaveLength(7);
    expect(owner.daily.at(-1)!.bookings).toBe(2);
    expect(owner.topVenues[0]!.bookings).toBe(2);

    const support = (await get('support', '/v1/admin/reports/overview?period=month')).json() as {
      revenue: unknown;
      daily: Array<{ bookingValue: number | null }>;
    };
    expect(support.revenue).toBeNull();
    expect(support.daily.every((d) => d.bookingValue === null)).toBe(true);
    const today = (await get('finance', '/v1/admin/reports/overview?period=today')).json() as {
      daily: unknown[];
    };
    expect(today.daily).toHaveLength(14);
  });

  it('exports bookings as CSV for finance only', async () => {
    const day = DateTime.now().setZone('Asia/Amman');
    const url = `/v1/admin/reports/bookings.csv?from=${day.toISODate()}&to=${day.plus({ days: 2 }).toISODate()}`;
    expect((await get('support', url)).statusCode).toBe(403);
    const r = await get('finance', url);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    const lines = r.body.trim().split('\r\n');
    expect(lines[0]).toContain('reference,business_date');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('20000');
  });

  it('filters and exports the audit log', async () => {
    const list = (await get('admin', '/v1/admin/audit-logs?action=venue.&limit=50')).json() as {
      items: Array<{ action: string }>;
    };
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.items.every((i) => i.action.startsWith('venue.'))).toBe(true);
    const mine = (
      await get('admin', `/v1/admin/audit-logs?actorUserId=${staff.admin!.userId}&limit=50`)
    ).json() as { items: Array<{ actorUserId: string }> };
    expect(mine.items.every((i) => i.actorUserId === staff.admin!.userId)).toBe(true);
    expect((await get('support', '/v1/admin/audit-logs.csv')).statusCode).toBe(403);
    const csv = await get('admin', '/v1/admin/audit-logs.csv?action=venue.');
    expect(csv.statusCode).toBe(200);
    expect(csv.body.split('\r\n')[0]).toContain('occurred_at,actor_type');
  });

  it('defuses spreadsheet formulas in CSV fields', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('plain')).toBe('plain');
    expect(csvField(-500)).toBe('-500');
    expect(csvField('a,b')).toBe('"a,b"');
  });
});
