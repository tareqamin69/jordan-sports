import { Inject, Injectable } from '@nestjs/common';
import type { AdminBookingDetail, MembershipRole, VenueBooking } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { Db, Tx } from '../../../platform/database/database.js';
import { DATABASE } from '../../../platform/database/database.module.js';
import { uuidv7 } from '../../../platform/database/ids.js';
import { bypassTenant, setTenant } from '../../../platform/database/tenant.js';
import { transaction } from '../../../platform/database/transaction.js';
import { AppError, Errors } from '../../../platform/http/errors.js';
import type { RequestMeta } from '../../../platform/http/request-context.js';
import { PaymentsService } from '../../payments/index.js';
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
import { recordStatus, releaseOccupancies } from './booking-store.js';
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
    private readonly payments: PaymentsService,
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
              // Taken by the venue itself (phone, walk-in): settled between the venue and the customer.
              payment_status: 'NOT_REQUIRED',
              payment_method: null,
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

    const result = await transaction(this.db, async (tx) => {
      const booking = await tx
        .selectFrom('booking.bookings')
        .select(['status', 'total', sql<Date>`upper(during)`.as('end')])
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
        // The venue cancelled: the player gets everything back.
        await this.payments.requestRefund(tx, {
          bookingId,
          reason: 'venue',
          amount: Number(booking.total ?? 0),
        });
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
    // After commit: the gateway is never called inside a database transaction.
    await this.payments.processRefunds({ bookingId });
    return result;
  }

  /** Check-in window opens an hour before the start; a no-show can be recorded up to 2 days after. */
  static readonly CHECK_IN_EARLY_MS = 60 * 60 * 1000;
  static readonly NO_SHOW_LATE_MS = 48 * 60 * 60 * 1000;

  /**
   * Front desk: the customer arrived, or did not come. The guard checked `booking.checkin` in
   * the booking's organization; `role` decides whether prices are shown back.
   */
  async markArrival(
    actor: StaffActor,
    tenant: { organizationId: string; role: MembershipRole },
    bookingId: string,
    arrived: boolean,
    now = new Date(),
  ): Promise<VenueBooking> {
    return transaction(this.db, async (tx) => {
      await setTenant(tx, tenant.organizationId);
      const booking = await tx
        .selectFrom('booking.bookings')
        .select([
          'status',
          'checked_in_at',
          sql<Date>`lower(during)`.as('start'),
          sql<Date>`upper(during)`.as('end'),
        ])
        .where('id', '=', bookingId)
        .where('organization_id', '=', tenant.organizationId)
        .forUpdate()
        .executeTakeFirst();
      if (!booking) throw Errors.notFound();
      const status = booking.status as BookingStatus;
      const start = new Date(booking.start).getTime();
      const end = new Date(booking.end).getTime();
      if (arrived) {
        if (status !== 'CONFIRMED' && status !== 'COMPLETED') {
          throw new AppError('INVALID_STATE_TRANSITION', 409);
        }
        if (now.getTime() < start - VenueBookingsService.CHECK_IN_EARLY_MS || now.getTime() > end) {
          throw new AppError('INVALID_STATE_TRANSITION', 409, 'Outside the check-in window');
        }
        if (!booking.checked_in_at) {
          await tx
            .updateTable('booking.bookings')
            .set({ checked_in_at: now, checked_in_by: actor.userId })
            .where('id', '=', bookingId)
            .execute();
        }
      } else {
        if (
          !canTransition(status, 'NO_SHOW') ||
          booking.checked_in_at !== null ||
          now.getTime() < start ||
          now.getTime() > end + VenueBookingsService.NO_SHOW_LATE_MS
        ) {
          throw new AppError('INVALID_STATE_TRANSITION', 409);
        }
        await tx
          .updateTable('booking.bookings')
          .set({ status: 'NO_SHOW' })
          .where('id', '=', bookingId)
          .execute();
        await releaseOccupancies(tx, [bookingId]);
        await recordStatus(tx, [
          {
            bookingId,
            from: status,
            to: 'NO_SHOW',
            actorType: 'venue',
            actorUserId: actor.userId,
          },
        ]);
      }
      await this.audit.record(
        {
          actorType: 'user',
          actorUserId: actor.userId,
          action: arrived ? 'booking.checked_in' : 'booking.no_show',
          targetType: 'booking',
          targetId: bookingId,
          organizationId: tenant.organizationId,
          details: {
            before: { status, checkedIn: booking.checked_in_at !== null },
            after: arrived ? { status, checkedIn: true } : { status: 'NO_SHOW', checkedIn: false },
          },
          meta: actor.meta,
        },
        tx,
      );
      const [view] = await this.loadForVenue(tx, tenant.organizationId, [bookingId]);
      return forVenueRole(view!, tenant.role);
    });
  }

  /** Platform staff: all bookings, newest first (explicit row-level security bypass). */
  async adminList(input: {
    limit: number;
    cursor?: string | undefined;
    venueId?: string | undefined;
    userId?: string | undefined;
    status?: BookingStatus | undefined;
    from?: string | undefined;
    to?: string | undefined;
    q?: string | undefined;
  }) {
    return this.db.transaction().execute(async (tx) => {
      await bypassTenant(tx);
      let q = bookingQuery(tx).where('b.status', '<>', 'EXPIRED');
      if (input.venueId) q = q.where('b.venue_id', '=', input.venueId);
      if (input.userId) q = q.where('b.customer_user_id', '=', input.userId);
      if (input.status) q = q.where('b.status', '=', input.status);
      if (input.from) q = q.where('b.business_date', '>=', input.from);
      if (input.to) q = q.where('b.business_date', '<=', input.to);
      if (input.q) {
        const like = `%${input.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        q = q.where((eb) =>
          eb.or([
            eb('b.reference', 'ilike', like),
            eb('u.display_name', 'ilike', like),
            eb('u.phone', 'like', like),
            eb('vc.name', 'ilike', like),
            eb('vc.phone', 'like', like),
          ]),
        );
      }
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

  private async adminDetail(tx: Tx, bookingId: string): Promise<AdminBookingDetail> {
    const row = await bookingQuery(tx).where('b.id', '=', bookingId).executeTakeFirst();
    if (!row) throw Errors.notFound();
    const history = await tx
      .selectFrom('booking.status_history')
      .select(['from_status', 'to_status', 'actor_type', 'reason', 'occurred_at'])
      .where('booking_id', '=', bookingId)
      .orderBy('occurred_at')
      .orderBy('id')
      .execute();
    return {
      ...toVenueBooking(row),
      customerUserId: row.customer_user_id,
      history: history.map((h) => ({
        from: h.from_status,
        to: h.to_status,
        actorType: h.actor_type,
        reason: h.reason,
        at: h.occurred_at.toISOString(),
      })),
    };
  }

  async adminGet(bookingId: string): Promise<AdminBookingDetail> {
    return this.db.transaction().execute(async (tx) => {
      await bypassTenant(tx);
      return this.adminDetail(tx, bookingId);
    });
  }

  /**
   * Platform staff cancel a held or confirmed booking (e.g. after a complaint). A paid booking is
   * refunded in full.
   */
  async adminCancel(
    actor: StaffActor,
    bookingId: string,
    reason: string,
    now = new Date(),
  ): Promise<AdminBookingDetail> {
    const result = await transaction(this.db, async (tx) => {
      await bypassTenant(tx);
      const booking = await tx
        .selectFrom('booking.bookings')
        .select(['status', 'organization_id', 'total', sql<Date>`upper(during)`.as('end')])
        .where('id', '=', bookingId)
        .forUpdate()
        .executeTakeFirst();
      if (!booking) throw Errors.notFound();
      const status = booking.status as BookingStatus;
      if (!canTransition(status, 'CANCELLED')) throw new AppError('INVALID_STATE_TRANSITION', 409);
      if (new Date(booking.end) <= now) throw new AppError('CANCELLATION_NOT_ALLOWED', 409);
      await tx
        .updateTable('booking.bookings')
        .set({
          status: 'CANCELLED',
          cancelled_at: now,
          cancelled_by: actor.userId,
          cancelled_by_role: 'admin',
          cancel_reason: reason,
          late_cancellation: null,
        })
        .where('id', '=', bookingId)
        .execute();
      await releaseOccupancies(tx, [bookingId]);
      if (status === 'CONFIRMED') {
        await this.payments.requestRefund(tx, {
          bookingId,
          reason: 'admin',
          amount: Number(booking.total ?? 0),
        });
      }
      await recordStatus(tx, [
        {
          bookingId,
          from: status,
          to: 'CANCELLED',
          actorType: 'admin',
          actorUserId: actor.userId,
          reason,
        },
      ]);
      if (status === 'CONFIRMED') {
        await enqueue(tx, { type: 'booking.cancelled', payload: { bookingId, by: 'admin' } });
      }
      await this.audit.record(
        {
          actorType: 'admin',
          actorUserId: actor.userId,
          action: 'booking.cancelled_by_admin',
          targetType: 'booking',
          targetId: bookingId,
          organizationId: booking.organization_id,
          reason,
          details: { before: { status }, after: { status: 'CANCELLED' } },
          meta: actor.meta,
        },
        tx,
      );
      await bypassTenant(tx);
      return this.adminDetail(tx, bookingId);
    });
    // After commit: the gateway is never called inside a database transaction.
    await this.payments.processRefunds({ bookingId });
    return result;
  }
}
