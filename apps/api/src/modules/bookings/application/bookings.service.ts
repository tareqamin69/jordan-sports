import { Inject, Injectable } from '@nestjs/common';
import type { Booking } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { pgConstraint, pgErrorCode, PgError } from '../../../platform/database/errors.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { setTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import { referenceKey, takesOnlineBookings } from '../../finance/index.js';
import { enqueue } from '../../notifications/index.js';
import { PricingService } from '../../pricing/index.js';
import { ResourcesService } from '../../resources/index.js';
import {
  AvailabilityService,
  businessDateOf,
  computeSlots,
  OccupancyConflictError,
  OccupancyService,
  occupiedRange,
} from '../../scheduling/index.js';
import { VenuesService } from '../../venues/index.js';
import {
  canTransition,
  isLateCancellation,
  MAX_ACTIVE_HOLDS,
  newReference,
  type BookingStatus,
  type CancellationPolicy,
} from '../domain/booking-rules.js';
import { cliqManualProvider, type PaymentProvider } from '../domain/payment-provider.js';
import { expireHolds, recordStatus, refundDeposit, releaseOccupancies } from './booking-store.js';
import { bookingQuery, toBooking } from './booking-views.js';

export interface HoldRequest {
  readonly resourceId: string;
  readonly start: Date;
  readonly durationMinutes: number;
}

/** The only payment provider at launch (plan §4); a card gateway would be chosen per venue. */
const provider: PaymentProvider = cliqManualProvider;

/** A unique reference collision is astronomically rare; retry with a new one. */
function isReferenceCollision(error: unknown): boolean {
  return (
    pgErrorCode(error) === PgError.uniqueViolation &&
    pgConstraint(error) === 'bookings_reference_key'
  );
}

function isPaymentReferenceReuse(error: unknown): boolean {
  return (
    pgErrorCode(error) === PgError.uniqueViolation &&
    pgConstraint(error) === 'payments_reference_idx'
  );
}

/**
 * Player bookings: hold → confirm (pay at venue) or hold → send CliQ proof → the venue confirms
 * (CliQ venues, plan §4) → cancel (docs/architecture.md §G). The database
 * exclusion constraint is the only authority on double booking; availability is re-checked here
 * only to reject times the venue does not offer.
 */
@Injectable()
export class BookingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly venues: VenuesService,
    private readonly resources: ResourcesService,
    private readonly availability: AvailabilityService,
    private readonly occupancy: OccupancyService,
    private readonly pricing: PricingService,
  ) {}

  async get(userId: string, bookingId: string): Promise<Booking> {
    const row = await bookingQuery(this.db)
      .where('b.id', '=', bookingId)
      .where('b.customer_user_id', '=', userId)
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    return toBooking(row);
  }

  async listMine(userId: string, scope: 'upcoming' | 'past', now = new Date()): Promise<Booking[]> {
    let q = bookingQuery(this.db)
      .where('b.customer_user_id', '=', userId)
      .where('b.status', '<>', 'EXPIRED');
    q =
      scope === 'upcoming'
        ? q
            .where(sql<boolean>`upper(b.during) > ${now.toISOString()}::timestamptz`)
            .where('b.status', 'in', ['HELD', 'CONFIRMED'])
            .orderBy(sql`lower(b.during)`, 'asc')
        : q
            .where((eb) =>
              eb.or([
                eb(sql`upper(b.during)`, '<=', now),
                eb('b.status', 'in', ['CANCELLED', 'COMPLETED', 'NO_SHOW']),
              ]),
            )
            .orderBy(sql`lower(b.during)`, 'desc');
    const rows = await q.limit(100).execute();
    return rows
      .filter((r) => r.status !== 'HELD' || (r.hold_expires_at && r.hold_expires_at > now))
      .map(toBooking);
  }

  async hold(userId: string, request: HoldRequest, now = new Date()): Promise<Booking> {
    const resource = await this.resources.find(request.resourceId);
    const venue = await this.venues.find(resource.venueId);
    if (venue.status !== 'approved' || resource.status !== 'active') throw Errors.notFound();
    // A CliQ venue with an empty balance or an overdue refund takes no new online bookings (D2, D4).
    if (!(await takesOnlineBookings(this.db, venue, now))) {
      throw new AppError('VENUE_NOT_ACCEPTING_BOOKINGS', 409);
    }

    // Only times the venue actually offers (hours, alignment, durations, lead/advance windows).
    const date = businessDateOf(request.start, venue.businessDayStartMinute, venue.timezone);
    const ctx = (await this.availability.inputs(venue, [resource], date, now)).get(resource.id);
    const slot = ctx
      ? computeSlots(ctx.input).find(
          (s) =>
            s.start.getTime() === request.start.getTime() &&
            s.durationMinutes === request.durationMinutes,
        )
      : undefined;
    if (!ctx || !slot) throw new AppError('SLOT_NOT_BOOKABLE', 422);
    if (!slot.available) throw new AppError('SLOT_UNAVAILABLE', 409);

    const rules = (await this.pricing.rulesFor([resource.id])).get(resource.id) ?? [];
    const price = this.pricing.quoteSlot(venue, rules, slot.start, slot.durationMinutes, date);
    if (!price) throw new AppError('NO_PRICE', 422);

    const policy: CancellationPolicy = { cutoffHours: venue.cancellationCutoffHours };
    const during = occupiedRange(slot.start, slot.end, ctx.policy);
    const payment = provider.start(venue, price);
    // A CliQ hold lasts long enough for a bank-app transfer (plan §4: 30 minutes by default).
    const holdMinutes = payment ? venue.paymentHoldMinutes : ctx.policy.holdMinutes;
    const holdExpiresAt = new Date(now.getTime() + holdMinutes * 60_000);

    for (let attempt = 0; ; attempt++) {
      const bookingId = uuidv7();
      try {
        await transaction(this.db, async (tx) => {
          // Serializes one player's concurrent holds so the limit cannot be exceeded.
          await tx
            .selectFrom('identity.users')
            .select('id')
            .where('id', '=', userId)
            .forUpdate()
            .execute();
          const active = await tx
            .selectFrom('booking.bookings')
            .select((eb) => eb.fn.countAll<string>().as('n'))
            .where('customer_user_id', '=', userId)
            .where('status', '=', 'HELD')
            .where('hold_expires_at', '>', now)
            .executeTakeFirstOrThrow();
          if (Number(active.n) >= MAX_ACTIVE_HOLDS) throw new AppError('HOLD_LIMIT_REACHED', 409);

          await this.occupancy.lockUnits(tx, resource.unitIds);
          await expireHolds(tx, now, { unitIds: resource.unitIds, during });
          await tx
            .insertInto('booking.bookings')
            .values({
              id: bookingId,
              reference: newReference(),
              venue_id: venue.id,
              organization_id: venue.organizationId,
              resource_id: resource.id,
              channel: 'MARKETPLACE',
              customer_user_id: userId,
              status: 'HELD',
              payment_status: 'UNPAID',
              payment_method: payment ? 'CLIQ' : null,
              during: sql`tstzrange(${slot.start.toISOString()}::timestamptz, ${slot.end.toISOString()}::timestamptz, '[)')`,
              business_date: date,
              time_zone: venue.timezone,
              currency: price.currency,
              subtotal: String(price.amount),
              total: String(price.amount),
              price_snapshot: JSON.stringify({
                ruleId: price.ruleId,
                amount: price.amount,
                currency: price.currency,
                durationMinutes: slot.durationMinutes,
              }),
              cancellation_policy: JSON.stringify(policy),
              hold_expires_at: holdExpiresAt,
              created_by: userId,
            })
            .execute();
          await tx
            .insertInto('booking.booking_items')
            .values({
              id: uuidv7(),
              booking_id: bookingId,
              resource_id: resource.id,
              during: sql`tstzrange(${slot.start.toISOString()}::timestamptz, ${slot.end.toISOString()}::timestamptz, '[)')`,
              amount: String(price.amount),
            })
            .execute();
          if (payment) {
            await tx
              .insertInto('payment.payments')
              .values({
                id: uuidv7(),
                booking_id: bookingId,
                organization_id: venue.organizationId,
                venue_id: venue.id,
                provider: payment.provider,
                amount: String(payment.amount),
                currency: payment.currency,
                status: 'AWAITING_PROOF',
                payee_alias: payment.payeeAlias,
                payee_holder: payment.payeeHolder,
              })
              .execute();
          }
          await recordStatus(tx, [
            { bookingId, from: null, to: 'HELD', actorType: 'customer', actorUserId: userId },
          ]);
          try {
            await this.occupancy.occupy(tx, {
              venueId: venue.id,
              unitIds: resource.unitIds,
              during,
              kind: 'hold',
              bookingId,
              expiresAt: holdExpiresAt,
            });
          } catch (error) {
            if (error instanceof OccupancyConflictError) {
              throw new AppError('SLOT_UNAVAILABLE', 409);
            }
            throw error;
          }
        });
        return this.get(userId, bookingId);
      } catch (error) {
        if (attempt < 3 && isReferenceCollision(error)) continue;
        throw error;
      }
    }
  }

  private async lockOwn(tx: Tx, userId: string, bookingId: string) {
    const row = await tx
      .selectFrom('booking.bookings')
      .select([
        'id',
        'status',
        'hold_expires_at',
        'cancellation_policy',
        'venue_id',
        'organization_id',
        sql<Date>`lower(during)`.as('start'),
      ])
      .where('id', '=', bookingId)
      .where('customer_user_id', '=', userId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    const payment = await tx
      .selectFrom('payment.payments')
      .select(['id', 'status', 'reference_key'])
      .where('booking_id', '=', bookingId)
      .forUpdate()
      .executeTakeFirst();
    return {
      ...row,
      status: row.status as BookingStatus,
      start: new Date(row.start),
      payment: payment ?? null,
    };
  }

  async confirm(userId: string, bookingId: string, now = new Date()): Promise<Booking> {
    await transaction(this.db, async (tx) => {
      const booking = await this.lockOwn(tx, userId, bookingId);
      if (booking.status === 'CONFIRMED') return;
      if (booking.status === 'EXPIRED') throw new AppError('HOLD_EXPIRED', 409);
      // CliQ bookings are confirmed by the venue once the transfer arrives (plan §4, D5).
      if (booking.payment) throw new AppError('PAYMENT_REQUIRED', 409);
      if (!canTransition(booking.status, 'CONFIRMED')) {
        throw new AppError('INVALID_STATE_TRANSITION', 409);
      }
      if (!booking.hold_expires_at || booking.hold_expires_at <= now) {
        throw new AppError('HOLD_EXPIRED', 409);
      }
      await tx
        .updateTable('booking.bookings')
        .set({
          status: 'CONFIRMED',
          payment_method: 'PAY_AT_VENUE',
          hold_expires_at: null,
          confirmed_at: now,
        })
        .where('id', '=', bookingId)
        .execute();
      await tx
        .updateTable('scheduling.occupancies')
        .set({ kind: 'booking', expires_at: null })
        .where('booking_id', '=', bookingId)
        .where('active', '=', true)
        .execute();
      await recordStatus(tx, [
        { bookingId, from: 'HELD', to: 'CONFIRMED', actorType: 'customer', actorUserId: userId },
      ]);
      await enqueue(tx, { type: 'booking.confirmed', payload: { bookingId } });
    });
    return this.get(userId, bookingId);
  }

  /**
   * The player sent the CliQ transfer: store its reference and give the venue the hold time again
   * to confirm it (plan §4 step 3, D1). One transfer can pay for one booking only.
   */
  async submitProof(
    userId: string,
    bookingId: string,
    reference: string,
    now = new Date(),
  ): Promise<Booking> {
    const key = referenceKey(reference);
    if (key.length < 4) throw Errors.validation([{ path: ['reference'], message: 'Too short' }]);
    try {
      await transaction(this.db, async (tx) => {
        const booking = await this.lockOwn(tx, userId, bookingId);
        const payment = booking.payment;
        if (!payment) throw new AppError('PAYMENT_NOT_PENDING', 409);
        // Retries of the same proof are harmless.
        if (
          payment.reference_key === key &&
          (payment.status === 'SUBMITTED' || payment.status === 'CONFIRMED')
        ) {
          return;
        }
        if (booking.status === 'EXPIRED') throw new AppError('HOLD_EXPIRED', 409);
        if (booking.status !== 'HELD') throw new AppError('INVALID_STATE_TRANSITION', 409);
        if (!booking.hold_expires_at || booking.hold_expires_at <= now) {
          throw new AppError('HOLD_EXPIRED', 409);
        }
        if (payment.status === 'SUBMITTED') throw new AppError('PAYMENT_AWAITING_VENUE', 409);
        if (payment.status !== 'AWAITING_PROOF') throw new AppError('PAYMENT_NOT_PENDING', 409);

        const venue = await tx
          .selectFrom('venue.venues')
          .select('payment_hold_minutes')
          .where('id', '=', booking.venue_id)
          .executeTakeFirstOrThrow();
        const deadline = new Date(
          Math.max(
            booking.hold_expires_at.getTime(),
            now.getTime() + venue.payment_hold_minutes * 60_000,
          ),
        );
        await tx
          .updateTable('payment.payments')
          .set({
            status: 'SUBMITTED',
            reference: reference.trim(),
            reference_key: key,
            submitted_at: now,
            rejected_at: null,
            rejected_by: null,
            reject_reason: null,
          })
          .where('id', '=', payment.id)
          .execute();
        await tx
          .updateTable('booking.bookings')
          .set({ hold_expires_at: deadline })
          .where('id', '=', bookingId)
          .execute();
        await tx
          .updateTable('scheduling.occupancies')
          .set({ expires_at: deadline })
          .where('booking_id', '=', bookingId)
          .where('active', '=', true)
          .execute();
        await enqueue(tx, {
          type: 'payment.submitted',
          payload: { bookingId, paymentId: payment.id },
        });
      });
    } catch (error) {
      if (isPaymentReferenceReuse(error)) throw new AppError('PAYMENT_REFERENCE_USED', 409);
      throw error;
    }
    return this.get(userId, bookingId);
  }

  /** Releases a hold, or cancels a confirmed booking before it starts (late if past the cutoff). */
  async cancel(
    userId: string,
    bookingId: string,
    reason: string | undefined,
    now = new Date(),
  ): Promise<Booking> {
    await transaction(this.db, async (tx) => {
      const booking = await this.lockOwn(tx, userId, bookingId);
      if (booking.status === 'CANCELLED') return;
      if (!canTransition(booking.status, 'CANCELLED')) {
        throw new AppError('INVALID_STATE_TRANSITION', 409);
      }
      if (booking.status === 'CONFIRMED' && booking.start <= now) {
        throw new AppError('CANCELLATION_NOT_ALLOWED', 409);
      }
      // Proof sent: the money may be on its way; the venue answers (or the hold expires into a
      // dispute) before the player can walk away.
      if (booking.status === 'HELD' && booking.payment?.status === 'SUBMITTED') {
        throw new AppError('PAYMENT_AWAITING_VENUE', 409);
      }
      const late =
        booking.status === 'CONFIRMED'
          ? isLateCancellation(
              booking.start,
              booking.cancellation_policy as unknown as CancellationPolicy,
              now,
            )
          : false;
      await tx
        .updateTable('booking.bookings')
        .set({
          status: 'CANCELLED',
          hold_expires_at: null,
          cancelled_at: now,
          cancelled_by: userId,
          cancelled_by_role: 'customer',
          cancel_reason: reason ?? null,
          late_cancellation: late,
        })
        .where('id', '=', bookingId)
        .execute();
      await releaseOccupancies(tx, [bookingId]);
      if (booking.payment?.status === 'AWAITING_PROOF') {
        await tx
          .updateTable('payment.payments')
          .set({ status: 'CANCELLED' })
          .where('id', '=', booking.payment.id)
          .execute();
      }
      // Inside the free window the deposit is refunded and the commission returned; a late
      // cancellation keeps both (plan D2, D3).
      if (booking.status === 'CONFIRMED' && !late && booking.payment?.status === 'CONFIRMED') {
        await setTenant(tx, booking.organization_id);
        await refundDeposit(tx, bookingId, now);
      }
      await recordStatus(tx, [
        {
          bookingId,
          from: booking.status,
          to: 'CANCELLED',
          actorType: 'customer',
          actorUserId: userId,
          reason: reason ?? null,
        },
      ]);
      if (booking.status === 'CONFIRMED') {
        await enqueue(tx, { type: 'booking.cancelled', payload: { bookingId, by: 'customer' } });
      }
    });
    return this.get(userId, bookingId);
  }
}
