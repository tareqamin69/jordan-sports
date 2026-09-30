import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LifecycleService } from '../../src/modules/bookings/index.js';
import { OutboxDispatcher } from '../../src/modules/notifications/index.js';
import {
  call,
  createOrganization,
  createTestApp,
  createVenue,
  signInAdmin,
  payBooking,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

interface Slot {
  start: string;
  localStart: string;
  durationMinutes: number;
  available: boolean;
  price: { amount: number; currency: string };
}

interface BookingBody {
  id: string;
  reference: string;
  status: string;
  price: { amount: number; currency: string } | null;
  holdExpiresAt: string | null;
  localStart: string;
  businessDate: string;
  cancellation: { cutoffHours: number; freeUntil: string; late: boolean | null };
  customer?: { kind: string; name: string | null; phone: string | null };
}

const ZONE = 'Asia/Amman';

describe('bookings', () => {
  let t: TestApp;
  let admin: string;
  let owner: string;
  let orgId: string;
  let venueId: string;
  let slug: string;
  let court: string;
  const tomorrow = DateTime.now().setZone(ZONE).plus({ days: 1 }).toISODate()!;
  const inThreeDays = DateTime.now().setZone(ZONE).plus({ days: 3 }).toISODate()!;

  beforeAll(async () => {
    t = await createTestApp({ DATABASE_POOL_MAX: '20' });
    admin = (await signInAdmin(t.app)).cookie;
    const org = await createOrganization(t.app, admin);
    orgId = org.id;
    const venue = await createVenue(t.app, admin, org.id, { approve: true });
    venueId = venue.venueId;
    slug = venue.slug;
    court = venue.resourceIds[0]!;
    owner = (await signInPlayer(t.app, { phone: org.ownerPhone })).cookie;
    // Open 08:00–24:00 every day, 60/90 minute slots every 30 minutes, priced.
    const hours = await call(t.app, {
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
    });
    expect(hours.statusCode).toBe(200);
    const policy = await call(t.app, {
      method: 'PUT',
      url: `/v1/manage/resources/${court}/policy`,
      cookie: owner,
      body: {
        slotDurations: [60, 90],
        startAlignmentMinutes: 30,
        minLeadMinutes: 0,
        maxAdvanceDays: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
    });
    expect(policy.statusCode).toBe(200);
    const price = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/pricing`,
      cookie: owner,
      body: {
        resourceIds: [court],
        rule: {
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          startMinute: 0,
          endMinute: 1440,
          priority: 0,
          amounts: [
            { durationMinutes: 60, amount: 20000 },
            { durationMinutes: 90, amount: 28000 },
          ],
        },
      },
    });
    expect(price.statusCode).toBe(201);
  });

  afterAll(async () => {
    await t?.close();
  });

  async function slotAt(date: string, localStart: string, duration = 60): Promise<Slot> {
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/venues/${slug}/availability?date=${date}`,
    });
    const body = r.json() as { resources: Array<{ slots: Slot[] }> };
    const slot = body.resources[0]!.slots.find(
      (s) => s.localStart === localStart && s.durationMinutes === duration,
    );
    if (!slot) throw new Error(`No slot ${date} ${localStart}`);
    return slot;
  }

  const hold = (cookie: string, start: string, durationMinutes = 60, key = randomUUID()) =>
    call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie,
      headers: { 'idempotency-key': key },
      body: { resourceId: court, start, durationMinutes },
    });

  // Held → paid by card on the mock gateway → confirmed (ADR-0020).
  const confirm = (cookie: string, id: string) => payBooking(t.app, cookie, id);

  it('lists the venue with its from-price and free times when searching by date and time', async () => {
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/venues?date=${inThreeDays}&time=18:00`,
    });
    expect(r.statusCode).toBe(200);
    const items = (
      r.json() as {
        items: Array<{
          slug: string;
          priceFrom: { amount: number; durationMinutes: number } | null;
          sports: Array<{ icon: string }>;
          freeTimes?: Array<{ localStart: string }>;
        }>;
      }
    ).items;
    const venue = items.find((v) => v.slug === slug)!;
    expect(venue.priceFrom).toMatchObject({ amount: 20000, durationMinutes: 60 });
    expect(venue.sports[0]!.icon).toBe('racket-paddle');
    expect(venue.freeTimes!.length).toBeGreaterThan(0);
    for (const f of venue.freeTimes!) {
      const minutes = Number(f.localStart.slice(0, 2)) * 60 + Number(f.localStart.slice(3));
      expect(minutes).toBeGreaterThanOrEqual(17 * 60);
      expect(minutes).toBeLessThanOrEqual(20 * 60);
    }
    // A day beyond the booking window finds nothing.
    const far = DateTime.now().setZone(ZONE).plus({ days: 60 }).toISODate()!;
    const none = await call(t.app, { method: 'GET', url: `/v1/venues?date=${far}` });
    expect(
      (none.json() as { items: Array<{ slug: string }> }).items.map((v) => v.slug),
    ).not.toContain(slug);
  });

  it('holds, confirms and lists a booking; the slot becomes unavailable', async () => {
    const player = await signInPlayer(t.app, { name: 'Lina' });
    const slot = await slotAt(tomorrow, '10:00');
    expect(slot.available).toBe(true);

    const held = await hold(player.cookie, slot.start);
    expect(held.statusCode).toBe(201);
    const booking = held.json() as BookingBody;
    expect(booking.status).toBe('HELD');
    expect(booking.reference).toMatch(/^[A-Z0-9]{8}$/);
    expect(booking.price).toEqual({ amount: 20000, currency: 'JOD' });
    expect(booking.localStart).toBe('10:00');
    expect(booking.businessDate).toBe(tomorrow);
    const expiresIn = new Date(booking.holdExpiresAt!).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(9 * 60_000);
    expect(expiresIn).toBeLessThanOrEqual(10 * 60_000);
    expect((await slotAt(tomorrow, '10:00')).available).toBe(false);

    const confirmed = await confirm(player.cookie, booking.id);
    expect(confirmed.statusCode).toBe(200);
    expect((confirmed.json() as BookingBody).status).toBe('CONFIRMED');
    expect((confirmed.json() as BookingBody).holdExpiresAt).toBeNull();

    const mine = await call(t.app, {
      method: 'GET',
      url: '/v1/me/bookings',
      cookie: player.cookie,
    });
    expect((mine.json() as { items: BookingBody[] }).items.map((b) => b.id)).toContain(booking.id);

    // Another player cannot see it.
    const other = await signInPlayer(t.app);
    const peek = await call(t.app, {
      method: 'GET',
      url: `/v1/bookings/${booking.id}`,
      cookie: other.cookie,
    });
    expect(peek.statusCode).toBe(404);

    // The venue sees the player's name and phone.
    const venueList = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${venueId}/bookings?from=${tomorrow}&to=${tomorrow}`,
      cookie: owner,
    });
    const listed = (venueList.json() as { items: BookingBody[] }).items.find(
      (b) => b.id === booking.id,
    );
    expect(listed?.customer).toEqual({ kind: 'player', name: 'Lina', phone: player.phone });

    // Calendar shows the customer name.
    const calendar = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${venueId}/calendar?date=${tomorrow}`,
      cookie: owner,
    });
    const entries = (
      calendar.json() as {
        resources: Array<{
          entries: Array<{ bookingId: string; kind: string; customerName: string }>;
        }>;
      }
    ).resources[0]!.entries;
    expect(entries.find((e) => e.bookingId === booking.id)).toMatchObject({
      kind: 'booking',
      customerName: 'Lina',
    });
  });

  it('lets exactly one of 50 concurrent holds for the same slot succeed', async () => {
    const players = await Promise.all(Array.from({ length: 50 }, () => signInPlayer(t.app)));
    const slot = await slotAt(tomorrow, '14:00');
    const results = await Promise.all(players.map((p) => hold(p.cookie, slot.start)));
    const codes = results.map((r) => r.statusCode);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(49);
    for (const r of results.filter((r) => r.statusCode === 409)) {
      expect((r.json() as { code: string }).code).toBe('SLOT_UNAVAILABLE');
    }
    // Overlapping durations are blocked too (14:30 for 60 minutes overlaps 14:00–15:00).
    const overlapping = await slotAt(tomorrow, '14:30');
    expect(overlapping.available).toBe(false);
    const { rows } = await sql<{ n: string }>`
      SELECT count(*) AS n FROM scheduling.occupancies
      WHERE active AND lower(during) = ${slot.start}::timestamptz`.execute(t.db);
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('replays idempotent requests and rejects a reused key with a different body', async () => {
    const player = await signInPlayer(t.app);
    const slot = await slotAt(tomorrow, '16:00');
    const key = randomUUID();
    const first = await hold(player.cookie, slot.start, 60, key);
    const second = await hold(player.cookie, slot.start, 60, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect((second.json() as BookingBody).id).toBe((first.json() as BookingBody).id);

    const other = await slotAt(tomorrow, '18:00');
    const reused = await hold(player.cookie, other.start, 60, key);
    expect(reused.statusCode).toBe(422);
    expect((reused.json() as { code: string }).code).toBe('IDEMPOTENCY_KEY_REUSED');

    const missing = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie: player.cookie,
      body: { resourceId: court, start: other.start, durationMinutes: 60 },
    });
    expect(missing.statusCode).toBe(400);
    expect((missing.json() as { code: string }).code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    // A replayed failure fails the same way.
    const taken = await slotAt(tomorrow, '16:00');
    const rival = await signInPlayer(t.app);
    const failKey = randomUUID();
    expect((await hold(rival.cookie, taken.start, 60, failKey)).statusCode).toBe(409);
    expect((await hold(rival.cookie, taken.start, 60, failKey)).statusCode).toBe(409);
  });

  it('limits active holds per player and rejects times the venue does not offer', async () => {
    const player = await signInPlayer(t.app);
    const a = await slotAt(inThreeDays, '09:00');
    const b = await slotAt(inThreeDays, '11:00');
    const c = await slotAt(inThreeDays, '13:00');
    expect((await hold(player.cookie, a.start)).statusCode).toBe(201);
    expect((await hold(player.cookie, b.start)).statusCode).toBe(201);
    const third = await hold(player.cookie, c.start);
    expect(third.statusCode).toBe(409);
    expect((third.json() as { code: string }).code).toBe('HOLD_LIMIT_REACHED');

    const misaligned = new Date(new Date(c.start).getTime() + 10 * 60_000).toISOString();
    const bad = await hold((await signInPlayer(t.app)).cookie, misaligned);
    expect(bad.statusCode).toBe(422);
    expect((bad.json() as { code: string }).code).toBe('SLOT_NOT_BOOKABLE');
    const badDuration = await hold((await signInPlayer(t.app)).cookie, c.start, 45);
    expect((badDuration.json() as { code: string }).code).toBe('SLOT_NOT_BOOKABLE');
  });

  it('expires holds: an expired hold cannot be confirmed and frees the slot', async () => {
    const player = await signInPlayer(t.app);
    const slot = await slotAt(inThreeDays, '20:00');
    const booking = (await hold(player.cookie, slot.start)).json() as BookingBody;
    const past = new Date(Date.now() - 60_000);
    await t.ownerPool.query('UPDATE booking.bookings SET hold_expires_at = $1 WHERE id = $2', [
      past,
      booking.id,
    ]);
    await t.ownerPool.query(
      'UPDATE scheduling.occupancies SET expires_at = $1 WHERE booking_id = $2',
      [past, booking.id],
    );

    // The slot is free again before any sweep runs, and another player can take it.
    expect((await slotAt(inThreeDays, '20:00')).available).toBe(true);
    const late = await confirm(player.cookie, booking.id);
    expect(late.statusCode).toBe(409);
    expect((late.json() as { code: string }).code).toBe('HOLD_EXPIRED');

    const rival = await signInPlayer(t.app);
    const taken = await hold(rival.cookie, slot.start);
    expect(taken.statusCode).toBe(201);
    const original = await call(t.app, {
      method: 'GET',
      url: `/v1/bookings/${booking.id}`,
      cookie: player.cookie,
    });
    expect((original.json() as BookingBody).status).toBe('EXPIRED');

    // The sweep expires the rest.
    const other = await signInPlayer(t.app);
    const another = (
      await hold(other.cookie, (await slotAt(inThreeDays, '22:00')).start)
    ).json() as BookingBody;
    await t.ownerPool.query('UPDATE booking.bookings SET hold_expires_at = $1 WHERE id = $2', [
      past,
      another.id,
    ]);
    await t.ownerPool.query(
      'UPDATE scheduling.occupancies SET expires_at = $1 WHERE booking_id = $2',
      [past, another.id],
    );
    expect(await t.app.get(LifecycleService).expireHolds()).toBeGreaterThanOrEqual(1);
    const swept = await call(t.app, {
      method: 'GET',
      url: `/v1/bookings/${another.id}`,
      cookie: other.cookie,
    });
    expect((swept.json() as BookingBody).status).toBe('EXPIRED');
  });

  it('cancels: releasing a hold, free cancellation and late cancellation', async () => {
    const player = await signInPlayer(t.app);
    const slot = await slotAt(inThreeDays, '15:00');
    const held = (await hold(player.cookie, slot.start)).json() as BookingBody;
    const released = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${held.id}/cancel`,
      cookie: player.cookie,
      body: {},
    });
    expect(released.statusCode).toBe(200);
    expect((released.json() as BookingBody).status).toBe('CANCELLED');
    expect((await slotAt(inThreeDays, '15:00')).available).toBe(true);

    // In three days: well before the 24-hour cutoff → not late.
    const b = (await hold(player.cookie, slot.start)).json() as BookingBody;
    await confirm(player.cookie, b.id);
    const cancelled = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${b.id}/cancel`,
      cookie: player.cookie,
      body: { reason: 'Plans changed' },
    });
    expect((cancelled.json() as BookingBody).cancellation.late).toBe(false);

    // Tomorrow with a 48-hour cutoff → late.
    await call(t.app, {
      method: 'PATCH',
      url: `/v1/manage/venues/${venueId}/settings`,
      cookie: owner,
      body: { cancellationCutoffHours: 48 },
    });
    const soon = await slotAt(tomorrow, '21:00');
    const c = (await hold(player.cookie, soon.start)).json() as BookingBody;
    expect(c.cancellation.cutoffHours).toBe(48);
    await confirm(player.cookie, c.id);
    const lateCancel = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${c.id}/cancel`,
      cookie: player.cookie,
      body: {},
    });
    expect((lateCancel.json() as BookingBody).cancellation.late).toBe(true);
    await call(t.app, {
      method: 'PATCH',
      url: `/v1/manage/venues/${venueId}/settings`,
      cookie: owner,
      body: { cancellationCutoffHours: 24 },
    });
  });

  it('creates manual and weekly bookings, skipping taken weeks, and keeps customers private', async () => {
    const firstDate = DateTime.now().setZone(ZONE).plus({ days: 2 }).toISODate()!;
    // A player books week 2 first.
    const week2 = DateTime.fromISO(firstDate).plus({ days: 7 }).toISODate()!;
    const player = await signInPlayer(t.app);
    const w2 = await slotAt(week2, '19:00');
    const held = (await hold(player.cookie, w2.start)).json() as BookingBody;
    await confirm(player.cookie, held.id);

    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/bookings`,
      cookie: owner,
      body: {
        resourceId: court,
        date: firstDate,
        startTime: '19:00',
        durationMinutes: 60,
        customer: { name: 'Team Falcons', phone: '0791234567' },
        note: 'Weekly game',
        repeatWeeks: 4,
      },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json() as {
      created: BookingBody[];
      skipped: Array<{ date: string; reason: string }>;
      seriesId: string | null;
    };
    expect(body.created).toHaveLength(3);
    expect(body.skipped).toEqual([{ date: week2, reason: 'SLOT_UNAVAILABLE' }]);
    expect(body.seriesId).not.toBeNull();
    expect(body.created[0]!.customer).toEqual({
      kind: 'venue_customer',
      name: 'Team Falcons',
      phone: '+962791234567',
    });
    expect(body.created[0]!.price).toEqual({ amount: 20000, currency: 'JOD' });

    // A single manual booking on a taken time fails.
    const clash = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venueId}/bookings`,
      cookie: owner,
      body: {
        resourceId: court,
        date: firstDate,
        startTime: '19:30',
        durationMinutes: 60,
        customer: { name: 'Walk-in' },
      },
    });
    expect(clash.statusCode).toBe(409);

    // Row-level security: the application role sees venue customers only with a tenant context.
    const visible = await t.db.transaction().execute(async (tx) => {
      const none = await tx.selectFrom('booking.venue_customers').selectAll().execute();
      await sql`SELECT set_config('app.org_id', ${orgId}, true)`.execute(tx);
      const own = await tx.selectFrom('booking.venue_customers').selectAll().execute();
      return { none: none.length, own: own.length };
    });
    expect(visible.none).toBe(0);
    expect(visible.own).toBeGreaterThanOrEqual(1);
    await expect(
      t.db.transaction().execute(async (tx) => {
        await sql`SELECT set_config('app.org_id', ${randomUUID()}, true)`.execute(tx);
        await tx
          .insertInto('booking.venue_customers')
          .values({ id: randomUUID(), organization_id: orgId, name: 'Sneaky', phone: null })
          .execute();
      }),
    ).rejects.toThrow(/row-level security/);

    // Another organization's owner cannot list or cancel these bookings.
    const outsiderOrg = await createOrganization(t.app, admin);
    const outsider = (await signInPlayer(t.app, { phone: outsiderOrg.ownerPhone })).cookie;
    const denied = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${venueId}/bookings?from=${firstDate}&to=${firstDate}`,
      cookie: outsider,
    });
    expect(denied.statusCode).toBe(404);
    const deniedCancel = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/bookings/${body.created[0]!.id}/cancel`,
      cookie: outsider,
      body: { reason: 'Not mine' },
    });
    expect(deniedCancel.statusCode).toBe(404);
  });

  it('venue cancels a player booking; the outbox notifies both sides once', async () => {
    const player = await signInPlayer(t.app, { name: 'Omar' });
    const slot = await slotAt(inThreeDays, '17:00');
    const b = (await hold(player.cookie, slot.start)).json() as BookingBody;
    await confirm(player.cookie, b.id);

    const cancelled = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/bookings/${b.id}/cancel`,
      cookie: owner,
      body: { reason: 'Pitch maintenance' },
    });
    expect(cancelled.statusCode).toBe(200);
    expect((cancelled.json() as BookingBody).status).toBe('CANCELLED');

    const dispatcher = t.app.get(OutboxDispatcher);
    while ((await dispatcher.dispatchOnce()) > 0) {
      /* drain */
    }
    await dispatcher.dispatchOnce();
    const { rows } = await t.ownerPool.query<{ template: string; body: string; recipient: string }>(
      `SELECT d.template, d.body, d.recipient FROM notification.deliveries d
       JOIN platform.outbox_events e ON e.id = d.event_id
       WHERE e.payload->>'bookingId' = $1 ORDER BY d.created_at`,
      [b.id],
    );
    expect(rows.map((r) => r.template)).toEqual(['bookingConfirmed', 'bookingCancelledByVenue']);
    expect(rows.every((r) => r.recipient === player.phone)).toBe(true);
    expect(rows[0]!.body).toContain(b.reference);
    expect(rows[0]!.body).toContain('20.000');
    expect(rows[1]!.body).toContain('Pitch maintenance');
    const pending = await t.ownerPool.query(
      'SELECT count(*)::int AS n FROM platform.outbox_events WHERE processed_at IS NULL',
    );
    expect(pending.rows[0].n).toBe(0);

    // Player-side cancel of an already-cancelled booking is a no-op.
    const again = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${b.id}/cancel`,
      cookie: player.cookie,
      body: {},
    });
    expect(again.statusCode).toBe(200);
  });

  it('completes finished bookings and lists them for admins', async () => {
    const lifecycle = t.app.get(LifecycleService);
    const later = new Date(Date.now() + 40 * 24 * 3_600_000);
    expect(await lifecycle.completeFinished(later)).toBeGreaterThan(0);
    const list = await call(t.app, {
      method: 'GET',
      url: '/v1/admin/bookings?limit=5',
      cookie: admin,
    });
    expect(list.statusCode).toBe(200);
    const page = list.json() as { items: BookingBody[]; nextCursor: string | null };
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).not.toBeNull();
    expect(page.items.some((b) => b.customer?.kind === 'venue_customer')).toBe(true);
    const venueSide = await call(t.app, {
      method: 'GET',
      url: '/v1/admin/bookings',
      cookie: owner,
    });
    expect(venueSide.statusCode).toBe(401);
  });
});
