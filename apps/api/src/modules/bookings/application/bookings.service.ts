import { Inject, Injectable } from '@nestjs/common';
import type { Booking } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { pgConstraint, pgErrorCode, PgError } from '../../../platform/database/errors.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import { enqueue } from '../../notifications/index.js';
import { PaymentsService, refundAmount, type LateRefundPercent } from '../../payments/index.js';
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
import { expireHolds, recordStatus, releaseOccupancies } from './booking-store.js';
import { bookingQuery, toBooking } from './booking-views.js';

export interface HoldRequest {
  readonly resourceId: string;
  readonly start: Date;
  readonly durationMinutes: number;
}

/** A unique reference collision is astronomically rare; retry with a new one. */
function isReferenceCollision(error: unknown): boolean {
  return (
    pgErrorCode(error) === PgError.uniqueViolation &&
    pgConstraint(error) === 'bookings_reference_key'
  );
}

/**
 * Player bookings: hold → pay by card (CheckoutService) → confirmed → cancel with a refund
 * (docs/architecture.md §G, ADR-0020). The database exclusion constraint is the only authority on
 * double booking; availability is re-checked here only to reject times the venue does not offer.
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
    private readonly payments: PaymentsService,
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

    // The venue's rules at booking time apply to this booking, whatever it changes later.
    const policy: CancellationPolicy = {
      cutoffHours: venue.cancellationCutoffHours,
      lateRefundPercent: venue.lateRefundPercent,
    };
    const during = occupiedRange(slot.start, slot.end, ctx.policy);
    const holdExpiresAt = new Date(now.getTime() + ctx.policy.holdMinutes * 60_000);

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
              payment_method: 'CARD',
              commission_bps: venue.commissionBps,
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
        'total',
        sql<Date>`lower(during)`.as('start'),
      ])
      .where('id', '=', bookingId)
      .where('customer_user_id', '=', userId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw Errors.notFound();
    return { ...row, status: row.status as BookingStatus, start: new Date(row.start) };
  }

  /**
   * Releases a hold, or cancels a confirmed booking before it starts. A paid booking is refunded
   * to the card: in full inside the free window, else by the venue's late-refund percentage.
   */
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
      if (booking.status === 'CONFIRMED') {
        const policy = booking.cancellation_policy as unknown as CancellationPolicy;
        await this.payments.requestRefund(tx, {
          bookingId,
          reason: late ? 'customer_late' : 'customer_free',
          amount: refundAmount(
            Number(booking.total ?? 0),
            late ? 'customer_late' : 'customer_free',
            (policy.lateRefundPercent ?? 0) as LateRefundPercent,
          ),
        });
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
    await this.payments.processRefunds({ bookingId });
    return this.get(userId, bookingId);
  }
}
