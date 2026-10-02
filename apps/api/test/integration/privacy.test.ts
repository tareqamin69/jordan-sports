import { randomUUID } from 'node:crypto';
import { LEGAL_TEXTS_VERSION } from '@jordan-sports/contracts';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeExpiredPersonalData } from '../../src/worker/retention.js';
import {
  bookableVenue,
  call,
  createTestApp,
  payBooking,
  resetRateLimits,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

/** Consent records, marketing preference, account deletion and data export (PDPL). */
describe('privacy', () => {
  let t: TestApp;
  let adminCookie: string;
  let venue: Awaited<ReturnType<typeof bookableVenue>>;

  beforeAll(async () => {
    t = await createTestApp({ DATABASE_POOL_MAX: '20' });
    adminCookie = (await signInAdmin(t.app)).cookie;
    venue = await bookableVenue(t.app, adminCookie);
  });
  afterAll(async () => {
    await t?.close();
  });

  const exportOf = async (userId: string) => {
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/admin/users/${userId}/export`,
      cookie: adminCookie,
    });
    expect(r.statusCode, r.body).toBe(200);
    return r.json() as {
      profile: Record<string, unknown>;
      consents: Array<{ kind: string; version: string | null; booking_reference: string | null }>;
      bookings: Array<{ reference: string }>;
      payments: Array<{ kind: string; card_last4: string | null }>;
    };
  };

  const hold = async (cookie: string, daysAhead: number, time: string) => {
    const date = DateTime.now().setZone('Asia/Amman').plus({ days: daysAhead }).toISODate()!;
    const a = await call(t.app, {
      method: 'GET',
      url: `/v1/venues/${venue.slug}/availability?date=${date}`,
    });
    const start = (
      a.json() as { resources: Array<{ slots: Array<{ start: string; localStart: string }> }> }
    ).resources[0]!.slots.find((s) => s.localStart === time)!.start;
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: venue.resourceId, start, durationMinutes: 60 },
    });
    expect(r.statusCode, r.body).toBe(201);
    return r.json() as { id: string; reference: string };
  };

  it('records the terms version at sign-up and every marketing change', async () => {
    const player = await signInPlayer(t.app);
    const me = await call(t.app, { method: 'GET', url: '/v1/me', cookie: player.cookie });
    expect(me.json()).toMatchObject({ marketingOptIn: false });

    for (const marketingOptIn of [true, false]) {
      const r = await call(t.app, {
        method: 'PATCH',
        url: '/v1/me',
        cookie: player.cookie,
        body: { marketingOptIn },
      });
      expect(r.json()).toMatchObject({ marketingOptIn });
    }

    const data = await exportOf(player.userId);
    expect(data.profile).toMatchObject({ termsVersion: LEGAL_TEXTS_VERSION });
    expect(data.profile.termsAcceptedAt).toEqual(expect.any(String));
    expect(data.consents.map((c) => c.kind)).toEqual([
      'terms',
      'marketing_opt_in',
      'marketing_opt_out',
    ]);
    expect(data.consents[0]!.version).toBe(LEGAL_TEXTS_VERSION);
  });

  it('paying needs the 18+ confirmation, which is recorded with the booking', async () => {
    const player = await signInPlayer(t.app);
    const held = await hold(player.cookie, 4, '09:00');
    const refused = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${held.id}/checkout`,
      cookie: player.cookie,
      body: { locale: 'en', acceptCancellationPolicy: true },
    });
    expect(refused.statusCode).toBe(400);
    expect((await payBooking(t.app, player.cookie, held.id)).statusCode).toBe(200);

    const data = await exportOf(player.userId);
    expect(data.consents).toContainEqual(
      expect.objectContaining({ kind: 'adult_payment', booking_reference: held.reference }),
    );
    expect(data.bookings.map((b) => b.reference)).toContain(held.reference);
    // Only the brand and last four digits of the card are ever stored.
    expect(data.payments).toContainEqual(
      expect.objectContaining({ kind: 'charge', card_last4: '4242' }),
    );

    // An upcoming booking blocks deletion (cancel or play it first).
    const blocked = await call(t.app, {
      method: 'POST',
      url: '/v1/me/delete',
      cookie: player.cookie,
      body: { confirm: true },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: 'ACCOUNT_HAS_UPCOMING_BOOKINGS' });
  });

  it('a venue owner must hand over or archive the venue before deleting the account', async () => {
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/me/delete',
      cookie: venue.ownerCookie,
      body: { confirm: true },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ code: 'ACCOUNT_RUNS_VENUE' });
  });

  it('deleting an account removes personal details and ends every session', async () => {
    const player = await signInPlayer(t.app, { name: 'Lina' });
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/me/delete',
      cookie: player.cookie,
      body: { confirm: true },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(
      (await call(t.app, { method: 'GET', url: '/v1/me', cookie: player.cookie })).statusCode,
    ).toBe(401);

    const data = await exportOf(player.userId);
    expect(data.profile).toMatchObject({
      phone: null,
      displayName: null,
      status: 'deleted',
      deletedAt: expect.any(String),
    });

    // The same number can open a fresh account later.
    await resetRateLimits(t.app, player.phone);
    const again = await signInPlayer(t.app, { phone: player.phone });
    expect(again.userId).not.toBe(player.userId);
  });

  it('only staff who manage users can export someone’s data', async () => {
    const player = await signInPlayer(t.app);
    const support = await signInAdmin(t.app, 'support');
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/admin/users/${player.userId}/export`,
      cookie: support.cookie,
    });
    expect(r.statusCode).toBe(403);
  });

  it('old sign-in codes and the details of long-ended sessions are removed', async () => {
    const player = await signInPlayer(t.app);
    // Age this player's sign-in code and session past their retention periods.
    await t.ownerPool.query(
      `UPDATE identity.otp_challenges SET created_at = now() - interval '8 days' WHERE phone = $1`,
      [player.phone],
    );
    await t.ownerPool.query(
      `UPDATE identity.sessions SET expires_at = now() - interval '91 days' WHERE user_id = $1`,
      [player.userId],
    );
    expect(await purgeExpiredPersonalData(t.db)).toBeGreaterThanOrEqual(2);
    const otps = await t.ownerPool.query(
      'SELECT count(*)::int AS n FROM identity.otp_challenges WHERE phone = $1',
      [player.phone],
    );
    expect(otps.rows[0].n).toBe(0);
    const sessions = await t.ownerPool.query(
      'SELECT ip, user_agent FROM identity.sessions WHERE user_id = $1',
      [player.userId],
    );
    expect(sessions.rows).toEqual([{ ip: null, user_agent: null }]);
  });
});
