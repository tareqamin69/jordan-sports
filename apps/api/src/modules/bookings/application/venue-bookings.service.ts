import { Inject, Injectable } from '@nestjs/common';
import type { VenueBooking } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { bypassTenant, setTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { AuditService } from '../../audit/index.js';
import { normalizePhone } from '../../identity/index.js';
import { enqueue } from '../../notifications/index.js';
import { PricingService } from '../../pricing/index.js';
import { ResourcesService } from '../../resources/index.js';
import {
  addDays,
  businessDayRange,
  localToInstant,
  OccupancyConflictError,
  OccupancyService,
  occupiedRange,
  parseTime,
  ScheduleDataService,
} from '../../scheduling/index.js';
import { VenueAccessService, type VenueRow } from '../../venues/index.js';
import { canTransition, newReference, type BookingStatus } from '../domain/booking-rules.js';
import { recordStatus, refundDeposit, releaseOccupancies } from './booking-store.js';
import { bookingQuery, forVenueRole, toVenueBooking } from './booking-views.js';

export interface StaffActor {
  readonly userId: string;
  readonly meta: RequestMeta;
}

export interface ManualBookingInput {
  resourceId: string;
  /** Business date of the first occurrence. */
  date: string;
  startTime: string;
  durationMinutes: number;
  customer: { name: string; phone?: string | undefined };
  note?: string | undefined;
  repeatWeeks: number;
}

const MAX_RANGE_DAYS = 62;

/** Venue-local start instant of a business date + wall-clock time (times before the business day start belong to the next calendar day). */
function startInstant(venue: VenueRow, date: string, startTime: string): Date {
  const minute = parseTime(startTime);
  const calendarDate = minute < venue.businessDayStartMinute ? addDays(date, 1) : date;
  return localToInstant(calendarDate, minute, venue.timezone);
}

/** Venue staff bookings (/manage) and the platform-wide admin list. */
@Injectable()
export class VenueBookingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Db,
    private readonly access: VenueAccessService,
    private readonly resources: ResourcesService,
    private readonly data: ScheduleDataService,
    private readonly occupancy: OccupancyService,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  private async loadForVenue(tx: Tx, organizationId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    await setTenant(tx, organizationId);
    const rows = await bookingQuery(tx)
      .where('b.id', 'in', ids)
      .orderBy(sql`lower(b.during)`)
      .execute();
    return rows.map(toVenueBooking);
  }

  async list(
    userId: string,
    venueId: string,
    from: string,
    to: string,
  ): Promise<{ items: VenueBooking[] }> {
    const { venue, role } = await this.access.require(userId, venueId, 'booking.read');
    if (to < from || to > addDays(from, MAX_RANGE_DAYS)) {
      throw new AppError('VALIDATION_FAILED', 400, 'Invalid date range');
    }
    const items = await this.db.transaction().execute(async (tx) => {
      await setTenant(tx, venue.organizationId);
      const rows = await bookingQuery(tx)
        .where('b.venue_id', '=', venueId)
        .where('b.business_date', '>=', from)
        .where('b.business_date', '<=', to)
        .where('b.status', 'in', ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'])
        .orderBy(sql`lower(b.during)`)
        .limit(1000)
        .execute();
      return rows.map((r) => forVenueRole(toVenueBooking(r), role));
    });
    return { items };
  }

  /**
   * A booking taken by phone or at the desk, optionally repeating weekly. Staff may book outside
   * the public opening hours; only overlaps are refused. Occurrences whose time is taken are
   * skipped and reported; if none can be created the request fails.
   */
  async createManual(
    actor: StaffActor,
    venueId: string,
    input: ManualBookingInput,
    now = new Date(),
  ) {
    const { venue, role } = await this.access.require(actor.userId, venueId, 'booking.create');
    const resource = await this.resources.find(input.resourceId);
    if (resource.venueId !== venueId || resource.status === 'archived') throw Errors.notFound();
    const phone = input.customer.phone ? normalizePhone(input.customer.phone) : null;
    if (input.customer.phone && !phone) throw new AppError('INVALID_PHONE', 400);

    const firstStart = startInstant(venue, input.date, input.startTime);
    const day = businessDayRange(input.date, venue.businessDayStartMinute, venue.timezone);
    if (firstStart < day.start || firstStart >= day.end) {
      throw new AppError('VALIDATION_FAILED', 400, 'Start time outside the business day');
    }
    if (firstStart.getTime() + input.durationMinutes * 60_000 <= now.getTime()) {
      throw new AppError('VALIDATION_FAILED', 400, 'Booking is in the past');
    }
    const policy = (await this.data.policies([resource.id])).get(resource.id);
    const buffers = policy ?? { bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
    const rules = (await this.pricing.rulesFor([resource.id])).get(resource.id) ?? [];
    const cancellationPolicy = JSON.stringify({ cutoffHours: venue.cancellationCutoffHours });

    const result = await transaction(this.db, async (tx) => {
      await setTenant(tx, venue.organizationId);
      const customerId = await this.upsertCustomer(
        tx,
        venue.organizationId,
        input.customer.name,
        phone,
      );
      const seriesId = input.repeatWeeks > 1 ? uuidv7() : null;
      if (seriesId) {
        await tx
          .insertInto('booking.series')
          .values({
            id: seriesId,
            venue_id: venueId,
            resource_id: resource.id,
            venue_customer_id: customerId,
            first_date: input.date,
            start_time: input.startTime,
            duration_minutes: input.durationMinutes,
            weeks: input.repeatWeeks,
            created_by: actor.userId,
          })
          .execute();
      }

      const created: string[] = [];
      const skipped: Array<{ date: string; reason: 'SLOT_UNAVAILABLE' }> = [];
      for (let week = 0; week < input.repeatWeeks; week++) {
        const date = addDays(input.date, week * 7);
        const start = startInstant(venue, date, input.startTime);
        const end = new Date(start.getTime() + input.durationMinutes * 60_000);
        const quote = this.pricing.quoteSlot(venue, rules, start, input.durationMinutes, date);
        const bookingId = uuidv7();
        const range = sql<string>`tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)')`;
        await sql`SAVEPOINT occurrence`.execute(tx);
        try {
          await tx
            .insertInto('booking.bookings')
            .values({
              id: bookingId,
              reference: newReference(),
              venue_id: venueId,
              organization_id: venue.organizationId,
              resource_id: resource.id,
              channel: 'VENUE_MANUAL',
              venue_customer_id: customerId,
              series_id: seriesId,
              status: 'CONFIRMED',
              payment_status: 'UNPAID',
              payment_method: 'PAY_AT_VENUE',
              during: range,
              business_date: date,
              time_zone: venue.timezone,
              currency: venue.currency,
              subtotal: quote ? String(quote.amount) : null,
              total: quote ? String(quote.amount) : null,
              price_snapshot: quote
                ? JSON.stringify({
                    ruleId: quote.ruleId,
                    amount: quote.amount,
                    currency: quote.currency,
                  })
                : null,
              cancellation_policy: cancellationPolicy,
              note: input.note ?? null,
              confirmed_at: now,
              created_by: actor.userId,
            })
            .execute();
          await tx
            .insertInto('booking.booking_items')
            .values({
              id: uuidv7(),
              booking_id: bookingId,
              resource_id: resource.id,
              during: range,
              amount: quote ? String(quote.amount) : null,
            })
            .execute();
          await recordStatus(tx, [
            {
              bookingId,
              from: null,
              to: 'CONFIRMED',
              actorType: 'venue',
              actorUserId: actor.userId,
            },
          ]);
          await this.occupancy.occupy(tx, {
            venueId,
            unitIds: resource.unitIds,
            during: occupiedRange(start, end, buffers),
            kind: 'booking',
            bookingId,
          });
          await sql`RELEASE SAVEPOINT occurrence`.execute(tx);
          created.push(bookingId);
        } catch (error) {
          await sql`ROLLBACK TO SAVEPOINT occurrence`.execute(tx);
          if (!(error instanceof OccupancyConflictError)) throw error;
          skipped.push({ date, reason: 'SLOT_UNAVAILABLE' });
        }
      }
      if (created.length === 0) throw new AppError('SLOT_UNAVAILABLE', 409);

      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: 'booking.manual_created',
          targetType: seriesId ? 'booking_series' : 'booking',
          targetId: seriesId ?? created[0]!,
          organizationId: venue.organizationId,
          details: {
            resourceId: resource.id,
            date: input.date,
            startTime: input.startTime,
            durationMinutes: input.durationMinutes,
            weeks: input.repeatWeeks,
            created: created.length,
            skipped: skipped.map((s) => s.date),
          },
          meta: actor.meta,
        },
        tx,
      );
      return {
        created: (await this.loadForVenue(tx, venue.organizationId, created)).map((b) =>
          forVenueRole(b, role),
        ),
        skipped,
        seriesId: seriesId && created.length > 0 ? seriesId : null,
      };
    });
    return result;
  }

  private async upsertCustomer(
    tx: Tx,
    organizationId: string,
    name: string,
    phone: string | null,
  ): Promise<string> {
    if (!phone) {
      const id = uuidv7();
      await tx
        .insertInto('booking.venue_customers')
        .values({ id, organization_id: organizationId, name, phone: null })
        .execute();
      return id;
    }
    const row = await tx
      .insertInto('booking.venue_customers')
      .values({ id: uuidv7(), organization_id: organizationId, name, phone })
      .onConflict((oc) =>
        oc
          .columns(['organization_id', 'phone'])
          .where('phone', 'is not', null)
          .doUpdateSet({ name }),
      )
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** Cancels a confirmed booking as the venue. The player (if any) is notified. */
  async cancel(
    actor: StaffActor,
    bookingId: string,
    reason: string,
    now = new Date(),
  ): Promise<VenueBooking> {
    const found = await this.db
      .selectFrom('booking.bookings')
      .select(['venue_id'])
      .where('id', '=', bookingId)
      .executeTakeFirst();
    if (!found) throw Errors.notFound();
    const { venue } = await this.access.require(actor.userId, found.venue_id, 'booking.cancel');

    return transaction(this.db, async (tx) => {
      const booking = await tx
        .selectFrom('booking.bookings')
        .select(['status', sql<Date>`upper(during)`.as('end')])
        .where('id', '=', bookingId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const status = booking.status as BookingStatus;
      if (status !== 'CANCELLED') {
        if (status !== 'CONFIRMED' || !canTransition(status, 'CANCELLED')) {
          throw new AppError('INVALID_STATE_TRANSITION', 409);
        }
        if (new Date(booking.end) <= now) throw new AppError('CANCELLATION_NOT_ALLOWED', 409);
        await tx
          .updateTable('booking.bookings')
          .set({
            status: 'CANCELLED',
            cancelled_at: now,
            cancelled_by: actor.userId,
            cancelled_by_role: 'venue',
            cancel_reason: reason,
            late_cancellation: null,
          })
          .where('id', '=', bookingId)
          .execute();
        await releaseOccupancies(tx, [bookingId]);
        // The venue cancelled: it owes the player's deposit back, and the commission returns (D2, D3).
        await setTenant(tx, venue.organizationId);
        await refundDeposit(tx, bookingId, now);
        await recordStatus(tx, [
          {
            bookingId,
            from: status,
            to: 'CANCELLED',
            actorType: 'venue',
            actorUserId: actor.userId,
            reason,
          },
        ]);
        await enqueue(tx, { type: 'booking.cancelled', payload: { bookingId, by: 'venue' } });
        await this.audit.record(
          {
            actorType: 'user',
            actorUserId: actor.userId,
            action: 'booking.cancelled_by_venue',
            targetType: 'booking',
            targetId: bookingId,
            organizationId: venue.organizationId,
            details: { reason },
            meta: actor.meta,
          },
          tx,
        );
      }
      const [view] = await this.loadForVenue(tx, venue.organizationId, [bookingId]);
      return view!;
    });
  }

  /** Platform staff: all bookings, newest first (explicit row-level security bypass). */
  async adminList(input: {
    limit: number;
    cursor?: string | undefined;
    venueId?: string | undefined;
  }) {
    return this.db.transaction().execute(async (tx) => {
      await bypassTenant(tx);
      let q = bookingQuery(tx).where('b.status', '<>', 'EXPIRED');
      if (input.venueId) q = q.where('b.venue_id', '=', input.venueId);
      if (input.cursor) q = q.where('b.id', '<', input.cursor);
      const rows = await q
        .orderBy('b.id', 'desc')
        .limit(input.limit + 1)
        .execute();
      const items = rows.slice(0, input.limit).map(toVenueBooking);
      return {
        items,
        nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
      };
    });
  }
}
