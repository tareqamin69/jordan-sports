import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { archiveDemoData } from '../../src/cli/archive-demo-data.js';
import {
  bookableVenue,
  call,
  createTestApp,
  manualBooking,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

/** Launch cleanup (QA #20): archives demo data, dry-run first, audited, never touches real data. */
describe('launch cleanup', () => {
  let t: TestApp;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    admin = (await signInAdmin(t.app, 'admin')).cookie;
  });
  afterAll(async () => {
    await t?.close();
  });

  it('archives only demo venues, organizations and users; dry run changes nothing', async () => {
    const demo = await bookableVenue(t.app, admin);
    const real = await bookableVenue(t.app, admin);
    // Tag the demo venue's name, and its organization stays a normal-looking one.
    await t.ownerPool.query(
      `UPDATE venue.venues SET name = jsonb_build_object('ar', 'ملعب (تجريبي)', 'en', 'Demo court') WHERE id = $1`,
      [demo.venueId],
    );
    await t.ownerPool.query(
      `UPDATE tenancy.organizations SET name = jsonb_build_object('ar', 'منشأة (تجريبي)') WHERE id = $1`,
      [demo.organizationId],
    );
    const booking = await manualBooking(t.app, demo.ownerCookie, demo, 2);
    const demoPlayer = await signInPlayer(t.app);
    await t.ownerPool.query(
      `UPDATE identity.users SET display_name = 'لاعب (تجريبي)' WHERE id = $1`,
      [demoPlayer.userId],
    );
    const realPlayer = await signInPlayer(t.app);

    const dry = await archiveDemoData(t.ownerPool, { dryRun: true });
    expect(dry).toMatchObject({
      committed: false,
      venues: 1,
      organizations: 1,
      cancelledBookings: 1,
    });
    const still = await t.ownerPool.query('SELECT archived_at FROM venue.venues WHERE id = $1', [
      demo.venueId,
    ]);
    expect(still.rows[0].archived_at).toBeNull();

    const done = await archiveDemoData(t.ownerPool, { dryRun: false });
    expect(done).toMatchObject({
      committed: true,
      venues: 1,
      organizations: 1,
      cancelledBookings: 1,
    });
    const rows = await t.ownerPool.query<{ id: string; archived_at: Date | null }>(
      'SELECT id, archived_at FROM venue.venues WHERE id = ANY($1)',
      [[demo.venueId, real.venueId]],
    );
    expect(rows.rows.find((r) => r.id === demo.venueId)!.archived_at).not.toBeNull();
    expect(rows.rows.find((r) => r.id === real.venueId)!.archived_at).toBeNull();
    const cancelled = await t.ownerPool.query(
      'SELECT status, cancel_reason FROM booking.bookings WHERE id = $1',
      [booking.id],
    );
    expect(cancelled.rows[0]).toMatchObject({
      status: 'CANCELLED',
      cancel_reason: 'Demo data cleanup',
    });

    // The demo venue is gone from the public site; the real one stays; the demo user is out.
    expect((await call(t.app, { method: 'GET', url: `/v1/venues/${demo.slug}` })).statusCode).toBe(
      404,
    );
    expect((await call(t.app, { method: 'GET', url: `/v1/venues/${real.slug}` })).statusCode).toBe(
      200,
    );
    expect(
      (await call(t.app, { method: 'GET', url: '/v1/me', cookie: demoPlayer.cookie })).statusCode,
    ).toBe(401);
    expect(
      (await call(t.app, { method: 'GET', url: '/v1/me', cookie: realPlayer.cookie })).statusCode,
    ).toBe(200);

    const audit = await t.ownerPool.query<{ action: string }>(
      "SELECT action FROM audit.audit_logs WHERE reason = 'Launch cleanup: demo data' OR action = 'launch.cleanup_completed'",
    );
    expect(audit.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        'venue.archived',
        'organization.suspended',
        'user.suspended',
        'launch.cleanup_completed',
      ]),
    );

    // Running again is harmless.
    expect(await archiveDemoData(t.ownerPool, { dryRun: true })).toMatchObject({
      venues: 0,
      organizations: 0,
    });
  });

  it('never touches platform staff', async () => {
    const owner = await signInAdmin(t.app, 'support');
    await t.ownerPool.query(
      `UPDATE identity.users SET display_name = 'دعم (تجريبي)' WHERE id = $1`,
      [owner.userId],
    );
    await archiveDemoData(t.ownerPool, { dryRun: false });
    const row = await t.ownerPool.query('SELECT status FROM identity.users WHERE id = $1', [
      owner.userId,
    ]);
    expect(row.rows[0].status).toBe('active');
  });
});
