import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '../../../platform/config/config.js';
import { APP_CONFIG } from '../../../platform/config/config.module.js';
import type { Db } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import { enqueue } from '../../notifications/index.js';
import {
  CHECKOUT_ABANDONED_MINUTES,
  CHECKOUT_MINUTES,
  PaymentsService,
} from '../../payments/index.js';
import { recordStatus } from './booking-store.js';

/**
 * Card checkout of a held booking (ADR-0020): hold → the gateway's payment page → paid →
 * confirmed. The gateway's answer is fetched outside database transactions; the booking and
 * charge are then updated together. A payment that lands after the hold was lost is refunded.
 */
@Injectable()
export class CheckoutService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly payments: PaymentsService,
  ) {}

  /** Starts (or restarts) paying a held booking; returns the payment page. */
  async start(
    userId: string,
    bookingId: string,
    locale: 'ar' | 'en',
    /** The request's Origin header; used only if it is one of WEB_ORIGINS. */
    webOrigin?: string,
    now = new Date(),
  ): Promise<string> {
    // An earlier attempt may have been paid in another tab: settle it first.
    const open = await this.db
      .selectFrom('payment.transactions')
      .select('id')
      .where('booking_id', '=', bookingId)
      .where('kind', '=', 'charge')
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (open) await this.finalize(open.id, now);

    const started = await transaction(this.db, async (tx) => {
      const b = await tx
        .selectFrom('booking.bookings')
        .select([
          'id',
          'status',
          'hold_expires_at',
          'total',
          'currency',
          'reference',
          'venue_id',
          'organization_id',
        ])
        .where('id', '=', bookingId)
        .where('customer_user_id', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!b) throw Errors.notFound();
      if (b.status === 'CONFIRMED') return null;
      if (b.status === 'EXPIRED' || !b.hold_expires_at || b.hold_expires_at <= now) {
        throw new AppError('HOLD_EXPIRED', 409);
      }
      if (b.status !== 'HELD') throw new AppError('INVALID_STATE_TRANSITION', 409);
      if (b.total === null || Number(b.total) <= 0) throw new AppError('NO_PRICE', 422);

      const live = await this.payments.liveCharge(tx, bookingId);
      if (live) await this.payments.failCharge(tx, live.id, 'superseded');
      const chargeId = await this.payments.insertCharge(tx, {
        bookingId,
        organizationId: b.organization_id,
        venueId: b.venue_id,
        amount: Number(b.total),
        currency: b.currency,
      });
      // Enough time to type the card on the payment page.
      const until = new Date(
        Math.max(b.hold_expires_at.getTime(), now.getTime() + CHECKOUT_MINUTES * 60_000),
      );
      await tx
        .updateTable('booking.bookings')
        .set({ hold_expires_at: until })
        .where('id', '=', bookingId)
        .execute();
      await tx
        .updateTable('scheduling.occupancies')
        .set({ expires_at: until })
        .where('booking_id', '=', bookingId)
        .where('active', '=', true)
        .execute();
      return {
        chargeId,
        amount: Number(b.total),
        currency: b.currency,
        reference: b.reference,
      };
    });
    // Back to the web origin the player is on (session cookies are per host); else the main one.
    const base =
      webOrigin && this.config.webOrigins.includes(webOrigin) ? webOrigin : this.config.webBaseUrl;
    const bookingUrl = `${base}/${locale}/bookings/${bookingId}`;
    if (!started) return bookingUrl;
    return this.payments.openCheckout(started.chargeId, {
      amount: started.amount,
      currency: started.currency,
      description: `Jorena — ${started.reference}`,
      returnUrl: `${bookingUrl}?payment=return`,
      locale,
    });
  }

  /** The player is back from the payment page: settle the booking's pending charge, if any. */
  async verify(userId: string, bookingId: string, now = new Date()): Promise<void> {
    const charge = await this.db
      .selectFrom('payment.transactions as t')
      .innerJoin('booking.bookings as b', 'b.id', 't.booking_id')
      .select('t.id')
      .where('t.booking_id', '=', bookingId)
      .where('b.customer_user_id', '=', userId)
      .where('t.kind', '=', 'charge')
      .where('t.status', '=', 'pending')
      .executeTakeFirst();
    if (charge) await this.finalize(charge.id, now);
  }

  /**
   * Applies the gateway's outcome to a pending charge: paid → the booking is confirmed (or, if
   * its hold was already lost, refunded in full); failed → the player may try again while the
   * hold lasts. Idempotent.
   */
  async finalize(chargeId: string, now = new Date()): Promise<'paid' | 'failed' | 'pending'> {
    const charge = await this.db
      .selectFrom('payment.transactions')
      .select(['gateway_ref', 'status'])
      .where('id', '=', chargeId)
      .executeTakeFirst();
    if (!charge || charge.status !== 'pending') return 'pending';
    const outcome = await this.payments.checkoutStatus(charge);
    if (outcome.status === 'pending') return 'pending';

    let refundBookingId: string | null = null;
    await transaction(this.db, async (tx) => {
      const c = await tx
        .selectFrom('payment.transactions')
        .select(['booking_id', 'status'])
        .where('id', '=', chargeId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (c.status !== 'pending') return;
      if (outcome.status === 'failed') {
        await this.payments.failCharge(tx, chargeId, outcome.failureCode);
        return;
      }
      const b = await tx
        .selectFrom('booking.bookings')
        .select(['status', 'customer_user_id'])
        .where('id', '=', c.booking_id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await this.payments.succeedCharge(
        tx,
        chargeId,
        { brand: outcome.brand, last4: outcome.last4 },
        now,
      );
      if (b.status === 'HELD') {
        await tx
          .updateTable('booking.bookings')
          .set({
            status: 'CONFIRMED',
            payment_status: 'PAID',
            payment_method: 'CARD',
            hold_expires_at: null,
            confirmed_at: now,
          })
          .where('id', '=', c.booking_id)
          .execute();
        await tx
          .updateTable('scheduling.occupancies')
          .set({ kind: 'booking', expires_at: null })
          .where('booking_id', '=', c.booking_id)
          .where('active', '=', true)
          .execute();
        await recordStatus(tx, [
          {
            bookingId: c.booking_id,
            from: 'HELD',
            to: 'CONFIRMED',
            actorType: 'customer',
            actorUserId: b.customer_user_id,
          },
        ]);
        await enqueue(tx, { type: 'booking.confirmed', payload: { bookingId: c.booking_id } });
      } else {
        // Paid after the hold expired or was released: the time is gone, so the money goes back.
        await tx
          .updateTable('booking.bookings')
          .set({ payment_status: 'PAID', payment_method: 'CARD' })
          .where('id', '=', c.booking_id)
          .execute();
        const total = await tx
          .selectFrom('payment.transactions')
          .select('amount')
          .where('id', '=', chargeId)
          .executeTakeFirstOrThrow();
        await this.payments.requestRefund(tx, {
          bookingId: c.booking_id,
          reason: 'expired',
          amount: Number(total.amount),
        });
        refundBookingId = c.booking_id;
      }
    });
    if (refundBookingId) await this.payments.processRefunds({ bookingId: refundBookingId });
    return outcome.status === 'succeeded' ? 'paid' : 'failed';
  }

  /**
   * Worker: pending charges nobody came back for (closed tab, lost connection) are settled from
   * the gateway's answer; ones still pending after an hour are given up.
   */
  async reconcile(now = new Date()): Promise<number> {
    const stale = await this.payments.stalePendingCharges(new Date(now.getTime() - 2 * 60_000));
    let settled = 0;
    for (const c of stale) {
      const result = await this.finalize(c.id, now);
      if (result !== 'pending') {
        settled++;
      } else if (now.getTime() - c.created_at.getTime() > CHECKOUT_ABANDONED_MINUTES * 60_000) {
        await this.payments.failCharge(this.db, c.id, 'abandoned');
        settled++;
      }
    }
    return settled;
  }
}
