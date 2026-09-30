import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeDemoData, PurgeRefusedError } from '../../src/cli/purge-demo-data.js';
import {
  call,
  createOrganization,
  createTestApp,
  createVenue,
  signInAdmin,
  signInPlayer,
  type TestApp,
  payBooking,
} from '../support/app.js';

interface Arranged {
  orgId: string;
  slug: string;
  venueId: string;
  ownerPhone: string;
  bookingId: string;
  playerId: string;
}

describe('removing demo data before launch', () => {
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

  async function arrange(): Promise<Arranged> {
    const org = await createOrganization(t.app, admin);
    const venue = await createVenue(t.app, admin, org.id, { approve: true });
    const court = venue.resourceIds[0]!;
    const owner = (await signInPlayer(t.app, { phone: org.ownerPhone })).cookie;
    const put = (url: string, body: unknown) =>
      call(t.app, { method: 'PUT', url, cookie: owner, body });
    await put(`/v1/manage/resources/${court}/weekly-hours`, {
      windows: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        dayOfWeek: d,
        startMinute: 480,
        durationMinutes: 960,
      })),
    });
    await put(`/v1/manage/resources/${court}/policy`, {
      slotDurations: [60],
      startAlignmentMinutes: 60,
      minLeadMinutes: 0,
      maxAdvanceDays: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    });
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
    });
    const availability = await call(t.app, {
      method: 'GET',
      url: `/v1/venues/${venue.slug}/availability?date=${tomorrow}`,
    });
    const slot = (availability.json() as { resources: Array<{ slots: Array<{ start: string }> }> })
      .resources[0]!.slots[0]!;
    const player = await signInPlayer(t.app);
    const held = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie: player.cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: court, start: slot.start, durationMinutes: 60 },
    });
    const bookingId = (held.json() as { id: string }).id;
    const confirmed = await payBooking(t.app, player.cookie, bookingId);
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    // A photo row (the file itself lives in storage and is removed by the CLI).
    await t.ownerPool.query(
      `INSERT INTO venue.media (id, venue_id, storage_key, content_type, width, height, byte_size)
       VALUES ($1, $2, $3, 'image/webp', 10, 10, 100)`,
      [randomUUID(), venue.venueId, `${venue.venueId}/photo.webp`],
    );
    const slug = (
      await t.ownerPool.query<{ slug: string }>(
        'SELECT slug FROM tenancy.organizations WHERE id = $1',
        [org.id],
      )
    ).rows[0]!.slug;
    return {
      orgId: org.id,
      slug,
      venueId: venue.venueId,
      ownerPhone: org.ownerPhone,
      bookingId,
      playerId: player.userId,
    };
  }

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await t.ownerPool.query<{ n: string }>(sql, params)).rows[0]!.n);
  const bookingsOf = (orgId: string) =>
    count('SELECT count(*) AS n FROM booking.bookings WHERE organization_id = $1', [orgId]);

  it('dry run reports but deletes nothing; a real run removes only the chosen organization', async () => {
    const demo = await arrange();
    const keep = await arrange();
    const base = { userPhones: [demo.ownerPhone], allPlayers: false, force: false };

    const dry = await purgeDemoData(t.ownerPool, { ...base, orgSlugs: [demo.slug], dryRun: true });
    expect(dry.committed).toBe(false);
    expect(dry.deleted['booking.bookings']).toBe(1);
    expect(dry.mediaKeys).toEqual([`${demo.venueId}/photo.webp`]);
    expect(await bookingsOf(demo.orgId)).toBe(1);

    const done = await purgeDemoData(t.ownerPool, {
      ...base,
      orgSlugs: [demo.slug],
      dryRun: false,
    });
    expect(done.committed).toBe(true);
    expect(done.deleted).toMatchObject({
      'tenancy.organizations': 1,
      'venue.venues': 1,
      'booking.bookings': 1,
      'venue.media': 1,
    });
    expect(Object.keys(done.deleted)).toEqual(
      expect.arrayContaining(['booking.status_history', 'audit.audit_logs']),
    );

    // Nothing of the demo organization is left, anywhere.
    expect(
      await count('SELECT count(*) AS n FROM tenancy.organizations WHERE id = $1', [demo.orgId]),
    ).toBe(0);
    expect(
      await count('SELECT count(*) AS n FROM venue.venues WHERE id = $1', [demo.venueId]),
    ).toBe(0);
    expect(
      await count('SELECT count(*) AS n FROM booking.status_history WHERE booking_id = $1', [
        demo.bookingId,
      ]),
    ).toBe(0);
    expect(
      await count('SELECT count(*) AS n FROM scheduling.occupancies WHERE booking_id = $1', [
        demo.bookingId,
      ]),
    ).toBe(0);
    expect(
      await count('SELECT count(*) AS n FROM audit.audit_logs WHERE organization_id = $1', [
        demo.orgId,
      ]),
    ).toBe(0);
    expect(
      await count('SELECT count(*) AS n FROM identity.users WHERE phone = $1', [demo.ownerPhone]),
    ).toBe(0);
    // The other organization is untouched, including its booking, history and the public page.
    expect(await bookingsOf(keep.orgId)).toBe(1);
    expect(
      await count('SELECT count(*) AS n FROM booking.status_history WHERE booking_id = $1', [
        keep.bookingId,
      ]),
    ).toBeGreaterThan(0);
    expect(
      await count('SELECT count(*) AS n FROM identity.users WHERE phone = $1', [keep.ownerPhone]),
    ).toBe(1);

    // The append-only rules are back in force.
    await expect(
      t.ownerPool.query('UPDATE booking.status_history SET reason = $1 WHERE booking_id = $2', [
        'x',
        keep.bookingId,
      ]),
    ).rejects.toThrow();
  });

  it('removing all players refuses to delete bookings at kept venues unless forced', async () => {
    const demo = await arrange();
    const keep = await arrange();
    const opts = { orgSlugs: [demo.slug], userPhones: [], allPlayers: true, dryRun: false };

    await expect(purgeDemoData(t.ownerPool, { ...opts, force: false })).rejects.toBeInstanceOf(
      PurgeRefusedError,
    );
    // The refusal rolled everything back.
    expect(await bookingsOf(demo.orgId)).toBe(1);
    expect(await bookingsOf(keep.orgId)).toBe(1);

    await purgeDemoData(t.ownerPool, { ...opts, force: true });
    expect(await bookingsOf(demo.orgId)).toBe(0);
    expect(await bookingsOf(keep.orgId)).toBe(0);
    expect(
      await count('SELECT count(*) AS n FROM identity.users WHERE id = $1', [keep.playerId]),
    ).toBe(0);
    // Venue owners and staff survive: they are members or have credentials.
    expect(
      await count('SELECT count(*) AS n FROM identity.users WHERE phone = $1', [keep.ownerPhone]),
    ).toBe(1);
    expect(await count('SELECT count(*) AS n FROM identity.password_credentials')).toBeGreaterThan(
      0,
    );
    expect(
      await count('SELECT count(*) AS n FROM venue.venues WHERE id = $1', [keep.venueId]),
    ).toBe(1);
  });
});
