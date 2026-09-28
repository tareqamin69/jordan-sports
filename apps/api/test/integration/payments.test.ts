import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BookingsService,
  LifecycleService,
  VenuePaymentsService,
} from '../../src/modules/bookings/index.js';
import { setTenant } from '../../src/platform/database/tenant.js';
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
 * CliQ payments straight to the venue and the prepaid commission balance (plan §4–§5). Every
 * money edge case the owner listed has a test here: expired hold, duplicate reference, venue never
 * confirms, cancellation refunds, low / empty balance — plus concurrency and ledger invariants.
 */

interface Slot {
  start: string;
  localStart: string;
  durationMinutes: number;
  available: boolean;
}

interface PaymentBody {
  id: string;
  status: string;
  amount: { amount: number; currency: string };
  remainder: { amount: number; currency: string };
  payee: { alias: string; holderName: string | null };
  reference: string | null;
  rejectReason: string | null;
  refund: { status: string; dueSince: string; refundedAt: string | null } | null;
}

interface BookingBody {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  holdExpiresAt: string | null;
  start: string;
  cancellation: { late: boolean | null };
  payment: PaymentBody | null;
}

interface BalanceBody {
  balance: { amount: number };
  level: string;
  takingOnlineBookings: boolean;
  overdueRefunds: number;
  entries: Array<{ kind: string; amount: { amount: number }; bookingReference: string | null }>;
}

interface Arranged {
  orgId: string;
  venueId: string;
  slug: string;
  court: string;
  owner: string;
  ownerId: string;
}

const ZONE = 'Asia/Amman';
const PRICE_60 = 20_000; // 20 JOD
const DEPOSIT_60 = 4_000; // 20%
const COMMISSION_60 = 1_600; // 8%
const MINUTE = 60_000;

describe('CliQ payments and the commission balance', () => {
  let t: TestApp;
  let admin: { cookie: string; userId: string };
  const tomorrow = DateTime.now().setZone(ZONE).plus({ days: 1 }).toISODate()!;
  const inThreeDays = DateTime.now().setZone(ZONE).plus({ days: 3 }).toISODate()!;

  beforeAll(async () => {
    // CliQ is built but switched off by default (ADR-0018); these tests exercise it switched on.
    t = await createTestApp({ DATABASE_POOL_MAX: '20', FEATURE_CLIQ_PAYMENTS: 'true' });
    admin = await signInAdmin(t.app);
  });

  afterAll(async () => {
    await t?.close();
  });

  // ------------------------------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------------------------------

  async function arrange(
    options: { cliq?: boolean; deposit?: number | null; credit?: number } = {},
  ): Promise<Arranged> {
    const org = await createOrganization(t.app, admin.cookie);
    const venue = await createVenue(t.app, admin.cookie, org.id, { approve: true });
    const court = venue.resourceIds[0]!;
    const owner = await signInPlayer(t.app, { phone: org.ownerPhone });
    const put = async (url: string, body: unknown) => {
      const r = await call(t.app, { method: 'PUT', url, cookie: owner.cookie, body });
      expect(r.statusCode, r.body).toBe(200);
    };
    await put(`/v1/manage/resources/${court}/weekly-hours`, {
      windows: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        dayOfWeek: d,
        startMinute: 480,
        durationMinutes: 960,
      })),
    });
    await put(`/v1/manage/resources/${court}/policy`, {
      slotDurations: [60, 90],
      startAlignmentMinutes: 30,
      minLeadMinutes: 0,
      maxAdvanceDays: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    });
    const price = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venue.venueId}/pricing`,
      cookie: owner.cookie,
      body: {
        resourceIds: [court],
        rule: {
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          startMinute: 0,
          endMinute: 1440,
          priority: 0,
          amounts: [
            { durationMinutes: 60, amount: PRICE_60 },
            { durationMinutes: 90, amount: 28_000 },
          ],
        },
      },
    });
    expect(price.statusCode, price.body).toBe(201);
    if (options.cliq ?? true) {
      const settings = await call(t.app, {
        method: 'PATCH',
        url: `/v1/manage/venues/${venue.venueId}`,
        cookie: owner.cookie,
        body: {
          cliqAlias: `VENUE${Math.floor(Math.random() * 1e6)}`,
          cliqAliasHolderName: 'Venue Holder',
          depositPercentage: options.deposit === undefined ? 20 : options.deposit,
        },
      });
      expect(settings.statusCode, settings.body).toBe(200);
    }
    if (options.credit) await adjust(org.id, options.credit, 'Opening top-up');
    return {
      orgId: org.id,
      venueId: venue.venueId,
      slug: venue.slug,
      court,
      owner: owner.cookie,
      ownerId: owner.userId,
    };
  }

  async function adjust(orgId: string, amount: number, reason: string, cookie = admin.cookie) {
    return call(t.app, {
      method: 'POST',
      url: `/v1/admin/organizations/${orgId}/balance/adjustments`,
      cookie,
      body: { amount, reason },
    });
  }

  async function slotAt(v: Arranged, date: string, localStart: string): Promise<Slot> {
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/venues/${v.slug}/availability?date=${date}`,
    });
    expect(r.statusCode, r.body).toBe(200);
    const body = r.json() as { resources: Array<{ slots: Slot[] }> };
    const slot = body.resources[0]!.slots.find(
      (s) => s.localStart === localStart && s.durationMinutes === 60,
    );
    if (!slot) throw new Error(`No slot ${date} ${localStart}`);
    return slot;
  }

  const hold = (cookie: string, v: Arranged, start: string) =>
    call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: v.court, start, durationMinutes: 60 },
    });

  async function held(v: Arranged, date: string, localStart: string) {
    const player = await signInPlayer(t.app);
    const r = await hold(player.cookie, v, (await slotAt(v, date, localStart)).start);
    expect(r.statusCode, r.body).toBe(201);
    return { player, booking: r.json() as BookingBody };
  }

  const sendProof = (cookie: string, bookingId: string, reference: string) =>
    call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${bookingId}/payment-proof`,
      cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { reference },
    });

  const venueConfirm = (cookie: string, paymentId: string) =>
    call(t.app, { method: 'POST', url: `/v1/manage/payments/${paymentId}/confirm`, cookie });

  const venueReject = (cookie: string, paymentId: string, reason: string) =>
    call(t.app, {
      method: 'POST',
      url: `/v1/manage/payments/${paymentId}/reject`,
      cookie,
      body: { reason },
    });

  const markRefunded = (cookie: string, paymentId: string) =>
    call(t.app, { method: 'POST', url: `/v1/manage/payments/${paymentId}/refunded`, cookie });

  const getBooking = async (cookie: string, id: string) =>
    (await call(t.app, { method: 'GET', url: `/v1/bookings/${id}`, cookie })).json() as BookingBody;

  async function balance(v: Arranged): Promise<BalanceBody> {
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${v.venueId}/balance`,
      cookie: v.owner,
    });
    expect(r.statusCode, r.body).toBe(200);
    return r.json() as BalanceBody;
  }

  /** Runs a query as the owner role with row-level security bypassed (assertions only). */
  async function ownerQuery<R>(text: string, params: unknown[] = []): Promise<R[]> {
    const client = await t.ownerPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
      const r = await client.query(text, params);
      await client.query('COMMIT');
      return r.rows as R[];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Invariant: the cached balance always equals the sum of the ledger entries. */
  async function expectLedgerConsistent(orgId: string) {
    const [row] = await ownerQuery<{ cached: string | null; summed: string }>(
      `SELECT (SELECT balance FROM finance.balances WHERE organization_id = $1) AS cached,
              (SELECT coalesce(sum(amount), 0) FROM finance.balance_entries WHERE organization_id = $1) AS summed`,
      [orgId],
    );
    expect(Number(row!.cached ?? 0)).toBe(Number(row!.summed));
  }

  async function commissionEntries(bookingId: string) {
    return ownerQuery<{ kind: string; amount: string }>(
      `SELECT kind, amount FROM finance.balance_entries WHERE booking_id = $1 ORDER BY created_at`,
      [bookingId],
    );
  }

  async function isListed(v: Arranged): Promise<boolean> {
    const r = await call(t.app, { method: 'GET', url: '/v1/venues?limit=50' });
    return (r.json() as { items: Array<{ id: string }> }).items.some((i) => i.id === v.venueId);
  }

  const lifecycle = () => t.app.get(LifecycleService);

  // ------------------------------------------------------------------------------------------
  // Checkout
  // ------------------------------------------------------------------------------------------

  it('a CliQ hold asks for the deposit to the venue alias and lasts 30 minutes', async () => {
    const v = await arrange({ credit: 50_000 });
    const before = Date.now();
    const { booking } = await held(v, tomorrow, '18:00');
    expect(booking.status).toBe('HELD');
    expect(booking.paymentMethod).toBe('CLIQ');
    expect(booking.paymentStatus).toBe('UNPAID');
    expect(booking.payment).toMatchObject({
      status: 'AWAITING_PROOF',
      amount: { amount: DEPOSIT_60, currency: 'JOD' },
      remainder: { amount: PRICE_60 - DEPOSIT_60, currency: 'JOD' },
      payee: { holderName: 'Venue Holder' },
      reference: null,
      refund: null,
    });
    const ttl = new Date(booking.holdExpiresAt!).getTime() - before;
    expect(ttl).toBeGreaterThan(29 * MINUTE);
    expect(ttl).toBeLessThanOrEqual(31 * MINUTE);
  });

  it('uses the full price when the venue asks for 100% (and the 20% default when unset)', async () => {
    const full = await arrange({ credit: 50_000, deposit: 100 });
    expect((await held(full, tomorrow, '18:00')).booking.payment!.amount.amount).toBe(PRICE_60);
    const unset = await arrange({ credit: 50_000, deposit: null });
    expect((await held(unset, tomorrow, '18:00')).booking.payment!.amount.amount).toBe(DEPOSIT_60);
  });

  it('a CliQ booking cannot be confirmed as pay-at-venue by the player', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '18:00');
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${booking.id}/confirm`,
      cookie: player.cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { paymentMethod: 'PAY_AT_VENUE', acceptCancellationPolicy: true },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ code: 'PAYMENT_REQUIRED' });
  });

  // ------------------------------------------------------------------------------------------
  // Happy path and confirmation
  // ------------------------------------------------------------------------------------------

  it('proof → venue confirms: booking confirmed, deposit paid, commission charged once', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '18:00');
    const firstDeadline = new Date(booking.holdExpiresAt!).getTime();

    const sent = await sendProof(player.cookie, booking.id, 'CLQ-2026-0001');
    expect(sent.statusCode, sent.body).toBe(200);
    const pending = sent.json() as BookingBody;
    expect(pending.status).toBe('HELD');
    expect(pending.payment).toMatchObject({ status: 'SUBMITTED', reference: 'CLQ-2026-0001' });
    // The venue gets the hold time again once proof is sent (D1).
    expect(new Date(pending.holdExpiresAt!).getTime()).toBeGreaterThanOrEqual(firstDeadline);

    const list = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${v.venueId}/payments`,
      cookie: v.owner,
    });
    expect(list.statusCode).toBe(200);
    const { toConfirm } = list.json() as { toConfirm: BookingBody[] };
    expect(toConfirm.map((b) => b.id)).toEqual([booking.id]);

    const ok = await venueConfirm(v.owner, pending.payment!.id);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'DEPOSIT_PAID',
      holdExpiresAt: null,
      payment: { status: 'CONFIRMED' },
    });
    expect((await getBooking(player.cookie, booking.id)).status).toBe('CONFIRMED');

    // Confirming again is harmless: still one commission.
    expect((await venueConfirm(v.owner, pending.payment!.id)).statusCode).toBe(200);
    expect(await commissionEntries(booking.id)).toEqual([
      { kind: 'commission', amount: String(-COMMISSION_60) },
    ]);
    const b = await balance(v);
    expect(b.balance.amount).toBe(50_000 - COMMISSION_60);
    expect(b.entries[0]).toMatchObject({
      kind: 'commission',
      amount: { amount: -COMMISSION_60 },
      bookingReference: booking.reference,
    });
    await expectLedgerConsistent(v.orgId);

    // The slot is now a booking, not a hold.
    expect((await slotAt(v, tomorrow, '18:00')).available).toBe(false);
  });

  it('concurrent confirmations charge the commission exactly once', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '19:00');
    const paymentId = (
      (await sendProof(player.cookie, booking.id, 'RACE-0001')).json() as BookingBody
    ).payment!.id;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => venueConfirm(v.owner, paymentId)),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(await commissionEntries(booking.id)).toHaveLength(1);
    expect((await balance(v)).balance.amount).toBe(50_000 - COMMISSION_60);
    await expectLedgerConsistent(v.orgId);
  });

  it('"not received" sends the player back to awaiting payment with the reason; resending works', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '18:00');
    const paymentId = (
      (await sendProof(player.cookie, booking.id, 'NOTYET-01')).json() as BookingBody
    ).payment!.id;
    const rejected = await venueReject(v.owner, paymentId, 'Nothing arrived in our account yet');
    expect(rejected.statusCode, rejected.body).toBe(200);
    const seen = await getBooking(player.cookie, booking.id);
    expect(seen.status).toBe('HELD');
    expect(seen.payment).toMatchObject({
      status: 'AWAITING_PROOF',
      rejectReason: 'Nothing arrived in our account yet',
    });
    // The venue cannot confirm a payment it just said did not arrive.
    expect((await venueConfirm(v.owner, paymentId)).json()).toMatchObject({
      code: 'PAYMENT_NOT_PENDING',
    });
    expect(await commissionEntries(booking.id)).toHaveLength(0);

    // The transfer shows up later: the player sends the same reference again.
    const again = await sendProof(player.cookie, booking.id, 'NOTYET-01');
    expect(again.statusCode, again.body).toBe(200);
    expect((again.json() as BookingBody).payment).toMatchObject({
      status: 'SUBMITTED',
      rejectReason: null,
    });
    expect((await venueConfirm(v.owner, paymentId)).statusCode).toBe(200);
    expect(await commissionEntries(booking.id)).toHaveLength(1);
  });

  it('only the venue organization can confirm, reject or refund its payments', async () => {
    const v = await arrange({ credit: 50_000 });
    const other = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '18:00');
    const paymentId = (
      (await sendProof(player.cookie, booking.id, 'AUTHZ-0001')).json() as BookingBody
    ).payment!.id;
    expect((await venueConfirm(other.owner, paymentId)).statusCode).toBe(404);
    expect((await venueReject(other.owner, paymentId, 'not mine')).statusCode).toBe(404);
    expect((await venueConfirm(player.cookie, paymentId)).statusCode).toBe(404);
    const list = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${v.venueId}/payments`,
      cookie: other.owner,
    });
    expect(list.statusCode).toBe(404);
    expect(await commissionEntries(booking.id)).toHaveLength(0);
  });

  // ------------------------------------------------------------------------------------------
  // Duplicate reference
  // ------------------------------------------------------------------------------------------

  it('one CliQ transfer can pay for one booking only (per organization)', async () => {
    const v = await arrange({ credit: 50_000 });
    const a = await held(v, tomorrow, '10:00');
    const b = await held(v, tomorrow, '12:00');
    expect((await sendProof(a.player.cookie, a.booking.id, 'DUP-777-XY')).statusCode).toBe(200);

    // Same transfer, cosmetic changes (case, spaces, dashes) — refused.
    for (const variant of ['DUP-777-XY', 'dup 777 xy', 'Dup777Xy']) {
      const r = await sendProof(b.player.cookie, b.booking.id, variant);
      expect(r.statusCode).toBe(409);
      expect(r.json()).toMatchObject({ code: 'PAYMENT_REFERENCE_USED' });
    }
    expect((await getBooking(b.player.cookie, b.booking.id)).payment!.status).toBe(
      'AWAITING_PROOF',
    );

    // Retrying the same proof on the same booking is fine (network retries, double taps).
    const retry = await sendProof(a.player.cookie, a.booking.id, 'dup-777-xy');
    expect(retry.statusCode, retry.body).toBe(200);
    // Changing the reference while the venue is checking is not.
    const change = await sendProof(a.player.cookie, a.booking.id, 'OTHER-123');
    expect(change.json()).toMatchObject({ code: 'PAYMENT_AWAITING_VENUE' });

    // A different organization may see the same reference (a different bank's numbering).
    const elsewhere = await arrange({ credit: 50_000 });
    const c = await held(elsewhere, tomorrow, '10:00');
    expect((await sendProof(c.player.cookie, c.booking.id, 'DUP-777-XY')).statusCode).toBe(200);

    // A reference that is only separators is rejected as invalid.
    const junk = await sendProof(b.player.cookie, b.booking.id, '- - -');
    expect(junk.statusCode).toBe(400);
  });

  it('a pay-at-venue booking has no payment to send proof for', async () => {
    const v = await arrange({ cliq: false });
    const { player, booking } = await held(v, tomorrow, '18:00');
    expect(booking.payment).toBeNull();
    const r = await sendProof(player.cookie, booking.id, 'NOPE-0001');
    expect(r.json()).toMatchObject({ code: 'PAYMENT_NOT_PENDING' });
  });

  // ------------------------------------------------------------------------------------------
  // Expired hold
  // ------------------------------------------------------------------------------------------

  it('an unpaid hold expires after 30 minutes: slot freed, payment expired, no dispute, no commission', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '18:00');
    const deadline = new Date(booking.holdExpiresAt!);

    // Just before the deadline nothing happens.
    await lifecycle().expireHolds(new Date(deadline.getTime() - 1_000));
    expect((await getBooking(player.cookie, booking.id)).status).toBe('HELD');

    // Proof arriving after the deadline (before the sweep ran) is refused.
    await expect(
      t.app
        .get(BookingsService)
        .submitProof(player.userId, booking.id, 'LATE-0001', new Date(deadline.getTime() + 1_000)),
    ).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });

    expect(await lifecycle().expireHolds(new Date(deadline.getTime() + 1_000))).toBeGreaterThan(0);
    const after = await getBooking(player.cookie, booking.id);
    expect(after.status).toBe('EXPIRED');
    expect(after.payment!.status).toBe('EXPIRED');
    expect((await slotAt(v, tomorrow, '18:00')).available).toBe(true);

    const r = await sendProof(player.cookie, booking.id, 'LATE-0002');
    expect(r.json()).toMatchObject({ code: 'HOLD_EXPIRED' });
    const disputes = await ownerQuery(`SELECT 1 FROM payment.disputes WHERE booking_id = $1`, [
      booking.id,
    ]);
    expect(disputes).toHaveLength(0);
    expect(await commissionEntries(booking.id)).toHaveLength(0);
    expect((await balance(v)).balance.amount).toBe(50_000);
  });

  it('the venue cannot confirm or reject after the deadline', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '18:00');
    const sent = (await sendProof(player.cookie, booking.id, 'SLOW-0001')).json() as BookingBody;
    const late = new Date(new Date(sent.holdExpiresAt!).getTime() + 1_000);
    const payments = t.app.get(VenuePaymentsService);
    const actor = { userId: v.ownerId, meta: { ip: '10.0.0.1', userAgent: null, requestId: 'x' } };
    await expect(payments.confirm(actor as never, sent.payment!.id, late)).rejects.toMatchObject({
      code: 'HOLD_EXPIRED',
    });
    await expect(
      payments.reject(actor as never, sent.payment!.id, 'too late', late),
    ).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
    expect(await commissionEntries(booking.id)).toHaveLength(0);
  });

  // ------------------------------------------------------------------------------------------
  // Venue never confirms (D1)
  // ------------------------------------------------------------------------------------------

  it('proof sent but never confirmed: expires after the venue window and opens one dispute', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '18:00');
    const sent = (await sendProof(player.cookie, booking.id, 'GHOST-0001')).json() as BookingBody;
    const deadline = new Date(sent.holdExpiresAt!);

    // While the venue is checking, the player cannot walk away from a transfer they sent.
    const cancel = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${booking.id}/cancel`,
      cookie: player.cookie,
      body: {},
    });
    expect(cancel.json()).toMatchObject({ code: 'PAYMENT_AWAITING_VENUE' });

    const later = new Date(deadline.getTime() + 1_000);
    await lifecycle().expireHolds(later);
    await lifecycle().expireHolds(later); // a second worker / next tick: nothing more
    const after = await getBooking(player.cookie, booking.id);
    expect(after.status).toBe('EXPIRED');
    expect(after.payment!.status).toBe('EXPIRED');
    expect(after.payment!.reference).toBe('GHOST-0001');

    const disputes = await ownerQuery<{ kind: string; status: string; opened_by_role: string }>(
      `SELECT kind, status, opened_by_role FROM payment.disputes WHERE booking_id = $1`,
      [booking.id],
    );
    expect(disputes).toEqual([
      { kind: 'UNCONFIRMED_PAYMENT', status: 'OPEN', opened_by_role: 'system' },
    ]);
    const events = await ownerQuery(
      `SELECT 1 FROM platform.outbox_events WHERE type = 'dispute.opened' AND payload->>'bookingId' = $1`,
      [booking.id],
    );
    expect(events).toHaveLength(1);
    expect(await commissionEntries(booking.id)).toHaveLength(0);
    expect((await balance(v)).balance.amount).toBe(50_000);
    expect((await slotAt(v, tomorrow, '18:00')).available).toBe(true);
  });

  it('confirmation racing expiry: exactly one wins, and money follows the winner', async () => {
    for (let i = 0; i < 4; i++) {
      const v = await arrange({ credit: 50_000 });
      const { player, booking } = await held(v, tomorrow, '18:00');
      const sent = (
        await sendProof(player.cookie, booking.id, `RACE-EXP-${i}`)
      ).json() as BookingBody;
      const afterDeadline = new Date(new Date(sent.holdExpiresAt!).getTime() + 1_000);
      await Promise.allSettled([
        venueConfirm(v.owner, sent.payment!.id),
        lifecycle().expireHolds(afterDeadline),
      ]);
      const final = await getBooking(player.cookie, booking.id);
      const commissions = await commissionEntries(booking.id);
      if (final.status === 'CONFIRMED') {
        expect(final.payment!.status).toBe('CONFIRMED');
        expect(commissions).toHaveLength(1);
      } else {
        expect(final.status).toBe('EXPIRED');
        expect(final.payment!.status).toBe('EXPIRED');
        expect(commissions).toHaveLength(0);
      }
      await expectLedgerConsistent(v.orgId);
    }
  });

  // ------------------------------------------------------------------------------------------
  // Cancellations and refunds (D2, D3)
  // ------------------------------------------------------------------------------------------

  async function confirmed(v: Arranged, date: string, localStart: string, ref: string) {
    const { player, booking } = await held(v, date, localStart);
    const sent = (await sendProof(player.cookie, booking.id, ref)).json() as BookingBody;
    expect((await venueConfirm(v.owner, sent.payment!.id)).statusCode).toBe(200);
    return { player, booking: await getBooking(player.cookie, booking.id) };
  }

  it('player cancels in the free window: refund due, commission returned, venue marks it refunded', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await confirmed(v, inThreeDays, '18:00', 'FREE-0001');
    expect((await balance(v)).balance.amount).toBe(50_000 - COMMISSION_60);

    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${booking.id}/cancel`,
      cookie: player.cookie,
      body: { reason: 'Plans changed' },
    });
    expect(r.statusCode, r.body).toBe(200);
    const cancelled = r.json() as BookingBody;
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellation.late).toBe(false);
    expect(cancelled.payment!.refund).toMatchObject({ status: 'DUE', refundedAt: null });
    expect(cancelled.paymentStatus).toBe('DEPOSIT_PAID');

    expect(await commissionEntries(booking.id)).toEqual([
      { kind: 'commission', amount: String(-COMMISSION_60) },
      { kind: 'commission_reversal', amount: String(COMMISSION_60) },
    ]);
    expect((await balance(v)).balance.amount).toBe(50_000);

    const list = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${v.venueId}/payments`,
      cookie: v.owner,
    });
    const { refundsDue } = list.json() as { refundsDue: BookingBody[] };
    expect(refundsDue.map((b) => b.id)).toEqual([booking.id]);

    const done = await markRefunded(v.owner, cancelled.payment!.id);
    expect(done.statusCode, done.body).toBe(200);
    expect(done.json()).toMatchObject({
      paymentStatus: 'REFUNDED',
      payment: { refund: { status: 'REFUNDED' } },
    });
    expect((await markRefunded(v.owner, cancelled.payment!.id)).statusCode).toBe(200);
    expect((await balance(v)).balance.amount).toBe(50_000);
    await expectLedgerConsistent(v.orgId);
  });

  it('late cancellation keeps the commission and owes no refund', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await confirmed(v, inThreeDays, '18:00', 'LATE-CX-01');
    const oneHourBefore = new Date(new Date(booking.start).getTime() - 60 * MINUTE);
    const result = await t.app
      .get(BookingsService)
      .cancel(player.userId, booking.id, undefined, oneHourBefore);
    expect(result.status).toBe('CANCELLED');
    expect(result.cancellation.late).toBe(true);
    expect(result.payment!.refund).toBeNull();
    expect(await commissionEntries(booking.id)).toHaveLength(1);
    expect((await balance(v)).balance.amount).toBe(50_000 - COMMISSION_60);
    expect((await markRefunded(v.owner, result.payment!.id)).json()).toMatchObject({
      code: 'REFUND_NOT_DUE',
    });
  });

  it('venue cancels a paid booking: refund due and commission returned', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await confirmed(v, tomorrow, '20:00', 'VCX-0001');
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/bookings/${booking.id}/cancel`,
      cookie: v.owner,
      body: { reason: 'Pitch maintenance' },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect((r.json() as BookingBody).payment!.refund).toMatchObject({ status: 'DUE' });
    expect((await getBooking(player.cookie, booking.id)).payment!.refund!.status).toBe('DUE');
    expect(await commissionEntries(booking.id)).toHaveLength(2);
    expect((await balance(v)).balance.amount).toBe(50_000);
    await expectLedgerConsistent(v.orgId);
  });

  it('releasing an unpaid CliQ hold cancels its payment; nothing is owed', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await held(v, tomorrow, '18:00');
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${booking.id}/cancel`,
      cookie: player.cookie,
      body: {},
    });
    expect(r.statusCode).toBe(200);
    expect((r.json() as BookingBody).payment).toMatchObject({ status: 'CANCELLED', refund: null });
    expect(await commissionEntries(booking.id)).toHaveLength(0);
  });

  it('a refund left unmarked for 48 hours hides the venue until it is marked', async () => {
    const v = await arrange({ credit: 50_000 });
    const { player, booking } = await confirmed(v, inThreeDays, '18:00', 'OVERDUE-01');
    const cancelled = (
      await call(t.app, {
        method: 'POST',
        url: `/v1/bookings/${booking.id}/cancel`,
        cookie: player.cookie,
        body: {},
      })
    ).json() as BookingBody;
    expect(await isListed(v)).toBe(true); // just cancelled: still within 48 hours

    await ownerQuery(
      `UPDATE payment.payments SET refund_due_at = now() - interval '49 hours' WHERE booking_id = $1`,
      [booking.id],
    );
    expect(await isListed(v)).toBe(false);
    expect((await call(t.app, { method: 'GET', url: `/v1/venues/${v.slug}` })).statusCode).toBe(
      404,
    );
    const other = await signInPlayer(t.app);
    const blocked = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie: other.cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: v.court, start: booking.start, durationMinutes: 60 },
    });
    expect(blocked.json()).toMatchObject({ code: 'VENUE_NOT_ACCEPTING_BOOKINGS' });
    const b = await balance(v);
    expect(b.overdueRefunds).toBe(1);
    expect(b.takingOnlineBookings).toBe(false);

    expect((await markRefunded(v.owner, cancelled.payment!.id)).statusCode).toBe(200);
    expect(await isListed(v)).toBe(true);
  });

  // ------------------------------------------------------------------------------------------
  // Low / empty balance (D4)
  // ------------------------------------------------------------------------------------------

  it('a CliQ venue with no balance is hidden and takes no online bookings; manual bookings still work', async () => {
    const v = await arrange();
    expect(await isListed(v)).toBe(false);
    expect((await call(t.app, { method: 'GET', url: `/v1/venues/${v.slug}` })).statusCode).toBe(
      404,
    );
    expect(
      (
        await call(t.app, {
          method: 'GET',
          url: `/v1/venues/${v.slug}/availability?date=${tomorrow}`,
        })
      ).statusCode,
    ).toBe(404);
    const b = await balance(v);
    expect(b).toMatchObject({
      level: 'empty',
      takingOnlineBookings: false,
      balance: { amount: 0 },
    });

    const manual = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${v.venueId}/bookings`,
      cookie: v.owner,
      body: {
        resourceId: v.court,
        date: tomorrow,
        startTime: '21:00',
        durationMinutes: 60,
        customer: { name: 'Walk-in' },
      },
    });
    expect(manual.statusCode, manual.body).toBe(201);

    expect((await adjust(v.orgId, 20_000, 'First top-up')).statusCode).toBe(201);
    expect(await isListed(v)).toBe(true);
    // No commission on bookings the venue adds itself (D6).
    expect((await balance(v)).entries.map((e) => e.kind)).toEqual(['adjustment']);
  });

  it('crossing the 10 JOD threshold warns once; staying above zero keeps the venue visible', async () => {
    const v = await arrange({ credit: 11_000 });
    expect((await balance(v)).level).toBe('ok');
    await confirmed(v, tomorrow, '18:00', 'LOW-0001');
    const b = await balance(v);
    expect(b).toMatchObject({ level: 'low', takingOnlineBookings: true });
    expect(b.balance.amount).toBe(11_000 - COMMISSION_60);
    expect(await isListed(v)).toBe(true);
    await confirmed(v, tomorrow, '20:00', 'LOW-0002');
    const events = await ownerQuery(
      `SELECT type FROM platform.outbox_events WHERE payload->>'organizationId' = $1`,
      [v.orgId],
    );
    expect(events).toEqual([{ type: 'balance.low' }]);
  });

  it('the booking that takes the balance below zero is allowed, then the venue is hidden', async () => {
    const v = await arrange({ credit: 1_000 });
    // Two players are mid-payment when the balance is still positive.
    const a = await held(v, tomorrow, '10:00');
    const b = await held(v, tomorrow, '12:00');
    const pa = (await sendProof(a.player.cookie, a.booking.id, 'NEG-0001')).json() as BookingBody;
    const pb = (await sendProof(b.player.cookie, b.booking.id, 'NEG-0002')).json() as BookingBody;

    expect((await venueConfirm(v.owner, pa.payment!.id)).statusCode).toBe(200);
    // Balance is now negative, but the second player already paid: never blocked mid-payment.
    expect((await venueConfirm(v.owner, pb.payment!.id)).statusCode).toBe(200);
    const after = await balance(v);
    expect(after.balance.amount).toBe(1_000 - 2 * COMMISSION_60);
    expect(after).toMatchObject({ level: 'empty', takingOnlineBookings: false });
    expect(await isListed(v)).toBe(false);
    const empty = await ownerQuery(
      `SELECT 1 FROM platform.outbox_events WHERE type = 'balance.empty' AND payload->>'organizationId' = $1`,
      [v.orgId],
    );
    expect(empty).toHaveLength(1);

    // Existing bookings keep working: the player can still see and cancel theirs.
    expect((await getBooking(a.player.cookie, a.booking.id)).status).toBe('CONFIRMED');
    const third = await signInPlayer(t.app);
    const refused = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie: third.cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: v.court, start: a.booking.start, durationMinutes: 60 },
    });
    expect(refused.json()).toMatchObject({ code: 'VENUE_NOT_ACCEPTING_BOOKINGS' });

    // A top-up makes it visible again as soon as it is credited.
    expect((await adjust(v.orgId, 10_000, 'Top-up by CliQ')).statusCode).toBe(201);
    expect((await balance(v)).balance.amount).toBe(1_000 - 2 * COMMISSION_60 + 10_000);
    expect(await isListed(v)).toBe(true);
    await expectLedgerConsistent(v.orgId);
  });

  it('pay-at-venue venues are not gated by the balance and pay no commission', async () => {
    const v = await arrange({ cliq: false });
    expect(await isListed(v)).toBe(true);
    const { player, booking } = await held(v, tomorrow, '18:00');
    const r = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${booking.id}/confirm`,
      cookie: player.cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { paymentMethod: 'PAY_AT_VENUE', acceptCancellationPolicy: true },
    });
    expect(r.statusCode).toBe(200);
    expect(await commissionEntries(booking.id)).toHaveLength(0);
  });

  // ------------------------------------------------------------------------------------------
  // Ledger rules, tenancy and admin adjustments
  // ------------------------------------------------------------------------------------------

  it('the ledger is append-only and tenant-private', async () => {
    const v = await arrange({ credit: 5_000 });
    const w = await arrange({ credit: 7_000 });
    await expect(
      ownerQuery(`UPDATE finance.balance_entries SET amount = 1 WHERE organization_id = $1`, [
        v.orgId,
      ]),
    ).rejects.toThrow();
    await expect(
      ownerQuery(`DELETE FROM finance.balance_entries WHERE organization_id = $1`, [v.orgId]),
    ).rejects.toThrow();

    // As the application role: nothing without a tenant, only its own rows with one.
    const noTenant = await t.db
      .transaction()
      .execute((tx) =>
        tx.selectFrom('finance.balance_entries').select('organization_id').execute(),
      );
    expect(noTenant).toHaveLength(0);
    const scoped = await t.db.transaction().execute(async (tx) => {
      await setTenant(tx, v.orgId);
      return tx.selectFrom('finance.balance_entries').select('organization_id').execute();
    });
    expect(new Set(scoped.map((r) => r.organization_id))).toEqual(new Set([v.orgId]));
    const [visible] = (
      await sql<{
        ok: boolean;
      }>`SELECT finance.org_takes_online_bookings(${w.orgId}::uuid, now()) AS ok`.execute(t.db)
    ).rows;
    expect(visible!.ok).toBe(true);

    // Another organization's owner cannot read this balance.
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${v.venueId}/balance`,
      cookie: w.owner,
    });
    expect(r.statusCode).toBe(404);
  });

  it('admin adjustments need a reason and the finance permission, and are audited', async () => {
    const v = await arrange();
    const support = await signInAdmin(t.app, 'support');
    const finance = await signInAdmin(t.app, 'finance');
    expect((await adjust(v.orgId, 5_000, 'Top-up', support.cookie)).statusCode).toBe(403);
    expect((await adjust(v.orgId, 0, 'Nothing')).statusCode).toBe(400);
    expect((await adjust(v.orgId, 5_000, '')).statusCode).toBe(400);
    expect((await adjust(randomUUID(), 5_000, 'Unknown org')).statusCode).toBe(404);

    const credit = await adjust(v.orgId, 5_000, 'Top-up received', finance.cookie);
    expect(credit.statusCode, credit.body).toBe(201);
    const debit = await adjust(v.orgId, -2_000, 'Correction', finance.cookie);
    expect((debit.json() as BalanceBody).balance.amount).toBe(3_000);
    const read = await call(t.app, {
      method: 'GET',
      url: `/v1/admin/organizations/${v.orgId}/balance`,
      cookie: support.cookie,
    });
    expect(read.statusCode).toBe(200);
    expect((read.json() as BalanceBody).entries.map((e) => e.amount.amount)).toEqual([
      -2_000, 5_000,
    ]);

    const audit = await ownerQuery<{ reason: string }>(
      `SELECT reason FROM audit.audit_logs WHERE action = 'finance.balance_adjusted' AND target_id = $1 ORDER BY occurred_at`,
      [v.orgId],
    );
    expect(audit.map((a) => a.reason)).toEqual(['Top-up received', 'Correction']);
    await expectLedgerConsistent(v.orgId);
  });
});
