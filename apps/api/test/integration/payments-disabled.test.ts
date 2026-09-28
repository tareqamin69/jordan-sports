import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  call,
  createOrganization,
  createTestApp,
  createVenue,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

/**
 * CliQ payments switched off (the default, FEATURE_CLIQ_PAYMENTS unset): a venue that saved a CliQ
 * alias and has no commission balance is still listed and bookable, and bookings are paid at the
 * venue with no payment row and no commission (ADR-0018).
 */
describe('CliQ payments switched off', () => {
  let t: TestApp;
  let admin: string;
  const tomorrow = DateTime.now().setZone('Asia/Amman').plus({ days: 1 }).toISODate()!;

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await signInAdmin(t.app)).cookie;
  });

  afterAll(async () => {
    await t?.close();
  });

  it('reports the feature as off, never hides a venue for its balance, and books pay-at-venue', async () => {
    const catalog = (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json() as {
      features: { cliqPayments: boolean };
    };
    expect(catalog.features).toEqual({ cliqPayments: false });

    const org = await createOrganization(t.app, admin);
    const venue = await createVenue(t.app, admin, org.id, { approve: true });
    const court = venue.resourceIds[0]!;
    const owner = (await signInPlayer(t.app, { phone: org.ownerPhone })).cookie;
    const ok = async (r: { statusCode: number; body: string }, status = 200) =>
      expect(r.statusCode, r.body).toBe(status);
    await ok(
      await call(t.app, {
        method: 'PUT',
        url: `/v1/manage/resources/${court}/weekly-hours`,
        cookie: owner,
        body: {
          windows: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
            dayOfWeek: d,
            startMinute: 480,
            durationMinutes: 960,
          })),
        },
      }),
    );
    await ok(
      await call(t.app, {
        method: 'PUT',
        url: `/v1/manage/resources/${court}/policy`,
        cookie: owner,
        body: {
          slotDurations: [60],
          startAlignmentMinutes: 60,
          minLeadMinutes: 0,
          maxAdvanceDays: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 0,
        },
      }),
    );
    await ok(
      await call(t.app, {
        method: 'POST',
        url: `/v1/manage/venues/${venue.venueId}/pricing`,
        cookie: owner,
        body: {
          resourceIds: [court],
          rule: {
            daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
            startMinute: 0,
            endMinute: 1440,
            priority: 0,
            amounts: [{ durationMinutes: 60, amount: 20_000 }],
          },
        },
      }),
      201,
    );
    // A CliQ alias saved earlier (e.g. through the wizard) and a zero balance.
    await ok(
      await call(t.app, {
        method: 'PATCH',
        url: `/v1/manage/venues/${venue.venueId}`,
        cookie: owner,
        body: { cliqAlias: 'SAVED.ALIAS', cliqAliasHolderName: 'Owner', depositPercentage: 20 },
      }),
    );

    const list = await call(t.app, { method: 'GET', url: '/v1/venues?limit=50' });
    expect((list.json() as { items: Array<{ id: string }> }).items.map((i) => i.id)).toContain(
      venue.venueId,
    );
    await ok(await call(t.app, { method: 'GET', url: `/v1/venues/${venue.slug}` }));
    const availability = await call(t.app, {
      method: 'GET',
      url: `/v1/venues/${venue.slug}/availability?date=${tomorrow}`,
    });
    await ok(availability);
    const slot = (
      availability.json() as {
        resources: Array<{ slots: Array<{ start: string; durationMinutes: number }> }>;
      }
    ).resources[0]!.slots.find((s) => s.durationMinutes === 60)!;

    const player = (await signInPlayer(t.app)).cookie;
    const held = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie: player,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: court, start: slot.start, durationMinutes: 60 },
    });
    await ok(held, 201);
    const booking = held.json() as { id: string; payment: unknown; paymentMethod: unknown };
    expect(booking.payment).toBeNull();
    expect(booking.paymentMethod).toBeNull();

    const confirmed = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${booking.id}/confirm`,
      cookie: player,
      headers: { 'idempotency-key': randomUUID() },
      body: { paymentMethod: 'PAY_AT_VENUE', acceptCancellationPolicy: true },
    });
    await ok(confirmed);
    expect(confirmed.json()).toMatchObject({ status: 'CONFIRMED', paymentMethod: 'PAY_AT_VENUE' });

    const entries = await t.ownerPool.query(
      `SELECT 1 FROM finance.balance_entries WHERE booking_id = $1`,
      [booking.id],
    );
    expect(entries.rowCount).toBe(0);
    const balance = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${venue.venueId}/balance`,
      cookie: owner,
    });
    expect(balance.json()).toMatchObject({ cliqEnabled: false });
  });
});
