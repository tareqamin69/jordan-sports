import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CheckoutService } from '../../src/modules/bookings/index.js';
import { OutboxDispatcher } from '../../src/modules/notifications/index.js';
import {
  bookableVenue,
  call,
  createTestApp,
  payBooking,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

/** Card-only payments, refunds and venue payouts (ADR-0020), end to end through the mock gateway. */

interface BookingBody {
  id: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  holdExpiresAt: string | null;
  payment: {
    status: string;
    amount: { amount: number };
    card: { brand: string; last4: string } | null;
    lastFailure: string | null;
  } | null;
  refund: { amount: { amount: number }; status: string } | null;
  cancellation: { late: boolean | null; lateRefundPercent: number };
}

const ZONE = 'Asia/Amman';
// The IBAN registry's Jordanian example (valid checksum).
const IBAN = 'JO94CBJO0010000000000131000302';

describe('card payments', () => {
  let t: TestApp;
  let adminCookie: string;
  let venue: Awaited<ReturnType<typeof bookableVenue>>;
  let player: string;

  beforeAll(async () => {
    t = await createTestApp({ DATABASE_POOL_MAX: '20' });
    adminCookie = (await signInAdmin(t.app)).cookie;
    venue = await bookableVenue(t.app, adminCookie);
    player = (await signInPlayer(t.app)).cookie;
  });
  afterAll(async () => {
    await t?.close();
  });

  const slot = async (daysAhead: number, time: string) => {
    const date = DateTime.now().setZone(ZONE).plus({ days: daysAhead }).toISODate()!;
    const r = await call(t.app, {
      method: 'GET',
      url: `/v1/venues/${venue.slug}/availability?date=${date}`,
    });
    const slots = (
      r.json() as { resources: Array<{ slots: Array<{ start: string; localStart: string }> }> }
    ).resources[0]!.slots;
    return slots.find((s) => s.localStart === time)!.start;
  };
  const hold = async (cookie: string, daysAhead: number, time: string) => {
    const r = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: {
        resourceId: venue.resourceId,
        start: await slot(daysAhead, time),
        durationMinutes: 60,
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    return r.json() as BookingBody;
  };
  const get = async (cookie: string, id: string) =>
    (await call(t.app, { method: 'GET', url: `/v1/bookings/${id}`, cookie })).json() as BookingBody;
  const cancel = (cookie: string, id: string) =>
    call(t.app, { method: 'POST', url: `/v1/bookings/${id}/cancel`, cookie, body: {} });

  it('hold → pay by card → confirmed; card numbers never stored', async () => {
    const held = await hold(player, 3, '10:00');
    expect(held).toMatchObject({
      status: 'HELD',
      paymentMethod: 'CARD',
      payment: { status: 'unpaid', amount: { amount: 20_000 } },
    });
    const paid = await payBooking(t.app, player, held.id);
    expect(paid.statusCode, paid.body).toBe(200);
    expect(paid.json()).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      holdExpiresAt: null,
      payment: { status: 'paid', card: { brand: 'visa', last4: '4242' } },
      refund: null,
    });
    const rows = await t.ownerPool.query(
      'SELECT row_to_json(t)::text AS j FROM payment.transactions t WHERE booking_id = $1',
      [held.id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].j).not.toContain('424242424242');
    // The confirmation SMS says what was paid.
    const dispatcher = t.app.get(OutboxDispatcher);
    while ((await dispatcher.dispatchOnce()) > 0) {
      /* drain */
    }
    const sms = await t.ownerPool.query<{ body: string }>(
      "SELECT body FROM notification.deliveries WHERE template = 'bookingConfirmed' ORDER BY created_at DESC LIMIT 1",
    );
    expect(sms.rows[0]!.body).toContain('المبلغ المدفوع');
  });

  it('a declined card leaves the hold; another card then works', async () => {
    const held = await hold(player, 3, '11:00');
    const declined = await payBooking(t.app, player, held.id, '4000000000000002');
    expect(declined.json()).toMatchObject({
      status: 'HELD',
      payment: { status: 'unpaid', lastFailure: 'card_declined' },
    });
    const ok = await payBooking(t.app, player, held.id, '5555555555554444');
    expect(ok.json()).toMatchObject({
      status: 'CONFIRMED',
      payment: { card: { brand: 'mastercard', last4: '4444' } },
    });
  });

  it('the test page rejects mistyped cards without ending the attempt', async () => {
    const held = await hold(player, 3, '12:00');
    const start = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${held.id}/checkout`,
      cookie: player,
      body: { locale: 'ar', acceptCancellationPolicy: true, confirmAdult: true },
    });
    const { redirectUrl } = start.json() as { redirectUrl: string };
    expect(redirectUrl).toMatch(/\/ar\/pay\/test\/[0-9a-f-]{36}$/);
    const session = redirectUrl.split('/').pop()!;
    const bad = await call(t.app, {
      method: 'POST',
      url: `/v1/mock-gateway/sessions/${session}/pay`,
      body: { number: '4242424242424241', expiry: '12/40', cvc: '123' },
    });
    expect(bad.json()).toMatchObject({ status: 'pending', failureCode: 'invalid_card' });
    const page = await call(t.app, { method: 'GET', url: `/v1/mock-gateway/sessions/${session}` });
    expect(page.json()).toMatchObject({ status: 'pending', amount: { amount: 20_000 } });
    // Going back without paying leaves the booking held.
    await call(t.app, { method: 'POST', url: `/v1/mock-gateway/sessions/${session}/cancel` });
    const back = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${held.id}/checkout/verify`,
      cookie: player,
    });
    expect(back.json()).toMatchObject({ status: 'HELD', payment: { lastFailure: 'cancelled' } });
  });

  it('refunds: full inside the free window, the venue rule when late, full when the venue cancels', async () => {
    // Free window (3 days ahead, 24-hour cutoff): everything back.
    const free = await hold(player, 3, '13:00');
    await payBooking(t.app, player, free.id);
    const freeCancel = (await cancel(player, free.id)).json() as BookingBody;
    expect(freeCancel).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      cancellation: { late: false },
      refund: { amount: { amount: 20_000 }, status: 'succeeded' },
    });

    // Late with the venue's 50% rule (48-hour cutoff, tomorrow).
    await call(t.app, {
      method: 'PATCH',
      url: `/v1/manage/venues/${venue.venueId}/settings`,
      cookie: venue.ownerCookie,
      body: { cancellationCutoffHours: 48, lateRefundPercent: 50 },
    });
    const late = await hold(player, 1, '14:00');
    expect(late.cancellation.lateRefundPercent).toBe(50);
    await payBooking(t.app, player, late.id);
    const lateCancel = (await cancel(player, late.id)).json() as BookingBody;
    expect(lateCancel).toMatchObject({
      paymentStatus: 'PARTIALLY_REFUNDED',
      cancellation: { late: true },
      refund: { amount: { amount: 10_000 }, status: 'succeeded' },
    });

    // Late with 0%: nothing back, the booking stays paid.
    await call(t.app, {
      method: 'PATCH',
      url: `/v1/manage/venues/${venue.venueId}/settings`,
      cookie: venue.ownerCookie,
      body: { lateRefundPercent: 0 },
    });
    const kept = await hold(player, 1, '15:00');
    await payBooking(t.app, player, kept.id);
    expect((await cancel(player, kept.id)).json()).toMatchObject({
      paymentStatus: 'PAID',
      refund: null,
    });

    // The venue cancels a late booking: still everything back.
    const byVenue = await hold(player, 1, '16:00');
    await payBooking(t.app, player, byVenue.id);
    const vc = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/bookings/${byVenue.id}/cancel`,
      cookie: venue.ownerCookie,
      body: { reason: 'Floodlights broken' },
    });
    expect(vc.statusCode, vc.body).toBe(200);
    expect(await get(player, byVenue.id)).toMatchObject({
      paymentStatus: 'REFUNDED',
      refund: { amount: { amount: 20_000 }, status: 'succeeded' },
    });
    await call(t.app, {
      method: 'PATCH',
      url: `/v1/manage/venues/${venue.venueId}/settings`,
      cookie: venue.ownerCookie,
      body: { cancellationCutoffHours: 24 },
    });

    // The cancellation SMS tells the player the refund and when it arrives.
    const dispatcher = t.app.get(OutboxDispatcher);
    while ((await dispatcher.dispatchOnce()) > 0) {
      /* drain */
    }
    const sms = await t.ownerPool.query<{ body: string }>(
      "SELECT body FROM notification.deliveries WHERE template = 'bookingCancelledByVenue' ORDER BY created_at DESC LIMIT 1",
    );
    expect(sms.rows[0]!.body).toMatch(/رح يرجعلك .+ على بطاقتك خلال 5–10 أيام عمل/);
  });

  it('a payment that arrives after the hold was lost is refunded automatically', async () => {
    const held = await hold(player, 4, '10:00');
    const start = await call(t.app, {
      method: 'POST',
      url: `/v1/bookings/${held.id}/checkout`,
      cookie: player,
      body: { locale: 'en', acceptCancellationPolicy: true, confirmAdult: true },
    });
    const session = (start.json() as { redirectUrl: string }).redirectUrl.split('/').pop()!;
    // The player walks away; the hold runs out and is swept.
    await t.ownerPool.query(
      "UPDATE booking.bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = $1",
      [held.id],
    );
    await t.ownerPool.query(
      "UPDATE scheduling.occupancies SET expires_at = now() - interval '1 minute' WHERE booking_id = $1",
      [held.id],
    );
    await cancel(player, held.id);
    // …then pays on the still-open page, and the worker settles it.
    await call(t.app, {
      method: 'POST',
      url: `/v1/mock-gateway/sessions/${session}/pay`,
      body: { number: '4242424242424242', expiry: '12/40', cvc: '123' },
    });
    await t.ownerPool.query(
      "UPDATE payment.transactions SET created_at = now() - interval '5 minutes' WHERE booking_id = $1",
      [held.id],
    );
    expect(await t.app.get(CheckoutService).reconcile()).toBeGreaterThanOrEqual(1);
    expect(await get(player, held.id)).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      refund: { amount: { amount: 20_000 }, status: 'succeeded' },
    });
  });

  it('venue earnings and weekly payouts: account, due amount, mark paid once', async () => {
    const p2 = (await signInPlayer(t.app)).cookie;
    const b = await hold(p2, 2, '18:00');
    await payBooking(t.app, p2, b.id);
    // Played last week (moved into the past), so it is due now.
    await t.ownerPool.query(
      `UPDATE booking.bookings
          SET during = tstzrange(now() - interval '8 days', now() - interval '8 days' + interval '1 hour'),
              status = 'COMPLETED'
        WHERE id = $1`,
      [b.id],
    );
    const earnings = await call(t.app, {
      method: 'GET',
      url: `/v1/manage/venues/${venue.venueId}/earnings`,
      cookie: venue.ownerCookie,
    });
    expect(earnings.statusCode, earnings.body).toBe(200);
    const e = earnings.json() as {
      commissionBps: number;
      totals: { due: { amount: number } };
      items: Array<{
        bookingId: string;
        status: string;
        gross: { amount: number };
        commission: { amount: number };
        net: { amount: number };
      }>;
      account: unknown;
    };
    const item = e.items.find((i) => i.bookingId === b.id)!;
    // 8% of 20.000 JOD = 1.600 JOD.
    expect(item).toMatchObject({
      status: 'due',
      gross: { amount: 20_000 },
      commission: { amount: 1_600 },
      net: { amount: 18_400 },
    });
    expect(e.account).toBeNull();

    // Bank account: owner only, checksum-checked, masked for staff views.
    const setAccount = (cookie: string, iban: string) =>
      call(t.app, {
        method: 'PUT',
        url: `/v1/manage/venues/${venue.venueId}/payout-account`,
        cookie,
        body: { iban, holderName: 'Smash Padel LLC', bankName: 'Cairo Amman Bank' },
      });
    expect(
      (await setAccount(venue.ownerCookie, 'JO95CBJO0010000000000131000302')).json(),
    ).toMatchObject({
      code: 'INVALID_IBAN',
    });

    const owner = await signInAdmin(t.app, 'owner');
    const overview = async () =>
      (
        await call(t.app, { method: 'GET', url: '/v1/admin/payouts', cookie: owner.cookie })
      ).json() as {
        due: Array<{ venueId: string; net: { amount: number }; account: unknown }>;
      };
    const due = (await overview()).due.find((d) => d.venueId === venue.venueId)!;
    expect(due.account).toBeNull();
    const pay = (expectedNet: number) =>
      call(t.app, {
        method: 'POST',
        url: `/v1/admin/venues/${venue.venueId}/payouts`,
        cookie: owner.cookie,
        body: { reference: 'TRF-2026-001', expectedNet },
      });
    expect((await pay(due.net.amount)).json()).toMatchObject({ code: 'PAYOUT_ACCOUNT_MISSING' });

    expect(
      (await setAccount(venue.ownerCookie, IBAN.toLowerCase().replace(/(.{4})/g, '$1 ')))
        .statusCode,
    ).toBe(200);
    expect((await pay(due.net.amount + 1)).json()).toMatchObject({ code: 'PAYOUT_AMOUNT_CHANGED' });
    const paid = await pay(due.net.amount);
    expect(paid.statusCode, paid.body).toBe(201);
    expect(paid.json()).toMatchObject({ reference: 'TRF-2026-001', ibanLast4: '0302' });
    expect((await pay(due.net.amount)).json()).toMatchObject({ code: 'NOTHING_TO_PAY_OUT' });

    const after = (
      await call(t.app, {
        method: 'GET',
        url: `/v1/manage/venues/${venue.venueId}/earnings`,
        cookie: venue.ownerCookie,
      })
    ).json() as {
      items: Array<{ bookingId: string; status: string }>;
      payouts: unknown[];
      account: { ibanMasked: string };
    };
    expect(after.items.find((i) => i.bookingId === b.id)!.status).toBe('paid');
    expect(after.payouts).toHaveLength(1);
    expect(after.account.ibanMasked).toBe('JO94 •••• •••• 0302');

    // Gateway transactions and refunds for the admin.
    const tx = await call(t.app, {
      method: 'GET',
      url: '/v1/admin/payments/transactions?kind=refund',
      cookie: owner.cookie,
    });
    expect(tx.statusCode, tx.body).toBe(200);
    const refunds = (tx.json() as { items: Array<{ id: string; kind: string; status: string }> })
      .items;
    expect(refunds.length).toBeGreaterThan(0);
    expect(refunds.every((r) => r.kind === 'refund')).toBe(true);
    const retry = await call(t.app, {
      method: 'POST',
      url: `/v1/admin/payments/refunds/${refunds[0]!.id}/retry`,
      cookie: owner.cookie,
    });
    expect(retry.json()).toMatchObject({ code: 'REFUND_NOT_RETRYABLE' });
  });

  it('only the owner manages the payout account; front-desk staff never see money', async () => {
    const staffPhone = `+96279${String(Date.now()).slice(-7)}`;
    await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venue.venueId}/team`,
      cookie: venue.ownerCookie,
      body: { phone: staffPhone, displayName: 'Manager', role: 'manager' },
    });
    const manager = (await signInPlayer(t.app, { phone: staffPhone })).cookie;
    expect(
      (
        await call(t.app, {
          method: 'GET',
          url: `/v1/manage/venues/${venue.venueId}/payout-account`,
          cookie: manager,
        })
      ).statusCode,
    ).toBe(403);
  });
});
