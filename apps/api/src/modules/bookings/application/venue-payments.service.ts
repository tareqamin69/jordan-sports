import { Inject, Injectable } from '@nestjs/common';
import type { VenueBooking } from '@jordan-sports/contracts';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { setTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import { AuditService } from '../../audit/index.js';
import { chargeCommission, commissionAmount } from '../../finance/index.js';
import { enqueue } from '../../notifications/index.js';
import type { OrgPermission } from '../../tenancy/index.js';
import { VenueAccessService, type VenueRow } from '../../venues/index.js';
import type { BookingStatus } from '../domain/booking-rules.js';
import { recordStatus } from './booking-store.js';
import { bookingQuery, toVenueBooking } from './booking-views.js';
import type { StaffActor } from './venue-bookings.service.js';

/**
 * The venue's side of CliQ payments (plan §4 steps 4–5, D2): confirm that a transfer arrived
 * (confirms the booking and charges the commission once), answer "not received", and mark
 * refunds as sent.
 */
@Injectable()
export class VenuePaymentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly access: VenueAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(
    userId: string,
    venueId: string,
    now = new Date(),
  ): Promise<{ toConfirm: VenueBooking[]; refundsDue: VenueBooking[] }> {
    const { venue } = await this.access.require(userId, venueId, 'payments.manage');
    return transaction(this.db, async (tx) => {
      await setTenant(tx, venue.organizationId);
      const toConfirm = await bookingQuery(tx)
        .where('b.venue_id', '=', venueId)
        .where('b.status', '=', 'HELD')
        .where('b.hold_expires_at', '>', now)
        .where('p.status', '=', 'SUBMITTED')
        .orderBy('p.submitted_at')
        .limit(200)
        .execute();
      const refundsDue = await bookingQuery(tx)
        .where('b.venue_id', '=', venueId)
        .where('p.refund_status', '=', 'DUE')
        .orderBy('p.refund_due_at')
        .limit(200)
        .execute();
      return {
        toConfirm: toConfirm.map(toVenueBooking),
        refundsDue: refundsDue.map(toVenueBooking),
      };
    });
  }

  /** "وصلت الدفعة". Idempotent: confirming twice charges the commission once. */
  async confirm(actor: StaffActor, paymentId: string, now = new Date()): Promise<VenueBooking> {
    return this.withPayment(actor, paymentId, 'payments.manage', async (tx, venue, p) => {
      if (p.status === 'CONFIRMED') return;
      if (p.status !== 'SUBMITTED') throw new AppError('PAYMENT_NOT_PENDING', 409);
      if (p.booking_status !== 'HELD') throw new AppError('INVALID_STATE_TRANSITION', 409);
      // After the deadline the hold is (or is about to be) expired and disputed (plan D1).
      if (!p.hold_expires_at || p.hold_expires_at <= now) throw new AppError('HOLD_EXPIRED', 409);

      const total = p.total === null ? Number(p.amount) : Number(p.total);
      const paidInFull = Number(p.amount) >= total;
      await tx
        .updateTable('booking.bookings')
        .set({
          status: 'CONFIRMED',
          payment_status: paidInFull ? 'PAID' : 'DEPOSIT_PAID',
          payment_method: 'CLIQ',
          hold_expires_at: null,
          confirmed_at: now,
        })
        .where('id', '=', p.booking_id)
        .execute();
      await tx
        .updateTable('scheduling.occupancies')
        .set({ kind: 'booking', expires_at: null })
        .where('booking_id', '=', p.booking_id)
        .where('active', '=', true)
        .execute();
      await tx
        .updateTable('payment.payments')
        .set({ status: 'CONFIRMED', confirmed_at: now, confirmed_by: actor.userId })
        .where('id', '=', paymentId)
        .execute();
      // Charged even if it takes the balance below zero: never block a paid booking (plan D4).
      await chargeCommission(tx, {
        id: p.booking_id,
        organizationId: venue.organizationId,
        commission: commissionAmount(total, venue.commissionBps),
        currency: p.currency,
      });
      await recordStatus(tx, [
        {
          bookingId: p.booking_id,
          from: 'HELD',
          to: 'CONFIRMED',
          actorType: 'venue',
          actorUserId: actor.userId,
        },
      ]);
      await enqueue(tx, { type: 'booking.confirmed', payload: { bookingId: p.booking_id } });
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'payment.confirmed',
          targetType: 'booking',
          targetId: p.booking_id,
          organizationId: venue.organizationId,
          details: { paymentId, amount: Number(p.amount) },
          meta: actor.meta,
        },
        tx,
      );
    });
  }

  /** The transfer did not arrive: back to awaiting payment, with the reason shown to the player. */
  async reject(
    actor: StaffActor,
    paymentId: string,
    reason: string,
    now = new Date(),
  ): Promise<VenueBooking> {
    return this.withPayment(actor, paymentId, 'payments.manage', async (tx, venue, p) => {
      if (p.status !== 'SUBMITTED') throw new AppError('PAYMENT_NOT_PENDING', 409);
      if (p.booking_status !== 'HELD') throw new AppError('INVALID_STATE_TRANSITION', 409);
      if (!p.hold_expires_at || p.hold_expires_at <= now) throw new AppError('HOLD_EXPIRED', 409);
      await tx
        .updateTable('payment.payments')
        .set({
          status: 'AWAITING_PROOF',
          rejected_at: now,
          rejected_by: actor.userId,
          reject_reason: reason,
        })
        .where('id', '=', paymentId)
        .execute();
      await enqueue(tx, {
        type: 'payment.rejected',
        payload: { bookingId: p.booking_id, paymentId },
      });
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'payment.rejected',
          targetType: 'booking',
          targetId: p.booking_id,
          organizationId: venue.organizationId,
          reason,
          details: { paymentId },
          meta: actor.meta,
        },
        tx,
      );
    });
  }

  /** The venue sent the deposit back by CliQ (plan D2). Idempotent. */
  async markRefunded(
    actor: StaffActor,
    paymentId: string,
    now = new Date(),
  ): Promise<VenueBooking> {
    return this.withPayment(actor, paymentId, 'payments.manage', async (tx, venue, p) => {
      if (p.refund_status === 'REFUNDED') return;
      if (p.refund_status !== 'DUE') throw new AppError('REFUND_NOT_DUE', 409);
      await tx
        .updateTable('payment.payments')
        .set({ refund_status: 'REFUNDED', refunded_at: now, refunded_by: actor.userId })
        .where('id', '=', paymentId)
        .execute();
      await tx
        .updateTable('booking.bookings')
        .set({ payment_status: 'REFUNDED' })
        .where('id', '=', p.booking_id)
        .execute();
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'payment.refunded',
          targetType: 'booking',
          targetId: p.booking_id,
          organizationId: venue.organizationId,
          details: { paymentId, amount: Number(p.amount) },
          meta: actor.meta,
        },
        tx,
      );
    });
  }

  /**
   * Authorizes the actor for the payment's venue, then runs `work` with the booking and payment
   * rows locked (booking first, like every other booking write) and returns the fresh view.
   */
  private async withPayment(
    actor: StaffActor,
    paymentId: string,
    permission: OrgPermission,
    work: (tx: Tx, venue: VenueRow, payment: LockedPayment) => Promise<void>,
  ): Promise<VenueBooking> {
    const found = await this.db
      .selectFrom('payment.payments')
      .select(['venue_id', 'booking_id'])
      .where('id', '=', paymentId)
      .executeTakeFirst();
    if (!found) throw Errors.notFound();
    const { venue } = await this.access.require(actor.userId, found.venue_id, permission);
    return transaction(this.db, async (tx) => {
      await setTenant(tx, venue.organizationId);
      const booking = await tx
        .selectFrom('booking.bookings')
        .select(['id', 'status', 'hold_expires_at', 'total'])
        .where('id', '=', found.booking_id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const payment = await tx
        .selectFrom('payment.payments')
        .select(['id', 'booking_id', 'status', 'amount', 'currency', 'refund_status'])
        .where('id', '=', paymentId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await work(tx, venue, {
        ...payment,
        booking_status: booking.status as BookingStatus,
        hold_expires_at: booking.hold_expires_at ? new Date(booking.hold_expires_at) : null,
        total: booking.total,
      });
      const row = await bookingQuery(tx)
        .where('b.id', '=', found.booking_id)
        .executeTakeFirstOrThrow();
      return toVenueBooking(row);
    });
  }
}

interface LockedPayment {
  id: string;
  booking_id: string;
  status: string;
  amount: string;
  currency: string;
  refund_status: string | null;
  booking_status: BookingStatus;
  hold_expires_at: Date | null;
  total: string | null;
}
