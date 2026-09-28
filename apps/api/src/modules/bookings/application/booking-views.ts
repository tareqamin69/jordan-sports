import type { Booking, VenueBooking } from '@jordan-sports/contracts';
import { sql } from 'kysely';
import type { DbOrTx } from '../../../platform/database/database.js';
import { instantToLocal } from '../../scheduling/index.js';
import {
  freeCancellationUntil,
  type BookingStatus,
  type CancellationPolicy,
} from '../domain/booking-rules.js';

type Localized = { ar?: string; en?: string };

/**
 * Base query joining everything a booking view needs. Venue customers are private to their
 * organization (row-level security): without a tenant context the join yields nulls.
 */
export function bookingQuery(db: DbOrTx) {
  return db
    .selectFrom('booking.bookings as b')
    .innerJoin('venue.venues as v', 'v.id', 'b.venue_id')
    .innerJoin('resource.resources as r', 'r.id', 'b.resource_id')
    .leftJoin('identity.users as u', 'u.id', 'b.customer_user_id')
    .leftJoin('booking.venue_customers as vc', 'vc.id', 'b.venue_customer_id')
    .leftJoin('payment.payments as p', 'p.booking_id', 'b.id')
    .select([
      'b.id',
      'b.reference',
      'b.status',
      'b.payment_status',
      'b.payment_method',
      'b.channel',
      'b.venue_id',
      'b.organization_id',
      'b.resource_id',
      'b.customer_user_id',
      'b.series_id',
      'b.business_date',
      'b.time_zone',
      'b.currency',
      'b.total',
      'b.cancellation_policy',
      'b.note',
      'b.hold_expires_at',
      'b.cancelled_at',
      'b.cancelled_by_role',
      'b.cancel_reason',
      'b.late_cancellation',
      'b.checked_in_at',
      'b.created_at',
      sql<Date>`lower(b.during)`.as('start'),
      sql<Date>`upper(b.during)`.as('end'),
      'v.slug as venue_slug',
      'v.name as venue_name',
      'v.contact_phone as venue_phone',
      'v.address as venue_address',
      sql<number | null>`ST_Y(v.location::geometry)`.as('venue_lat'),
      sql<number | null>`ST_X(v.location::geometry)`.as('venue_lng'),
      'r.name as resource_name',
      'u.display_name as user_name',
      'u.phone as user_phone',
      'u.locale as user_locale',
      'vc.name as vc_name',
      'vc.phone as vc_phone',
      'p.id as pay_id',
      'p.status as pay_status',
      'p.amount as pay_amount',
      'p.payee_alias as pay_alias',
      'p.payee_holder as pay_holder',
      'p.reference as pay_reference',
      'p.submitted_at as pay_submitted_at',
      'p.reject_reason as pay_reject_reason',
      'p.refund_status as pay_refund_status',
      'p.refund_due_at as pay_refund_due_at',
      'p.refunded_at as pay_refunded_at',
      (eb) =>
        eb
          .selectFrom('resource.resource_formats as rf')
          .innerJoin('catalog.sport_formats as sf', 'sf.id', 'rf.sport_format_id')
          .innerJoin('catalog.sports as s', 's.id', 'sf.sport_id')
          .select('s.icon')
          .whereRef('rf.resource_id', '=', 'r.id')
          .orderBy('s.sort_order')
          .limit(1)
          .as('resource_icon'),
    ]);
}

export type BookingQuery = ReturnType<typeof bookingQuery>;

export type LoadedBooking = Awaited<ReturnType<BookingQuery['execute']>>[number];

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

function toPayment(r: LoadedBooking): Booking['payment'] {
  if (!r.pay_id || r.pay_amount === null || r.pay_alias === null) return null;
  const amount = Number(r.pay_amount);
  const total = r.total === null ? amount : Number(r.total);
  return {
    id: r.pay_id,
    provider: 'CLIQ_MANUAL',
    status: r.pay_status as NonNullable<Booking['payment']>['status'],
    amount: { amount, currency: r.currency },
    remainder: { amount: total - amount, currency: r.currency },
    payee: { alias: r.pay_alias, holderName: r.pay_holder },
    reference: r.pay_reference,
    submittedAt: iso(r.pay_submitted_at),
    rejectReason: r.pay_reject_reason,
    refund:
      r.pay_refund_status && r.pay_refund_due_at
        ? {
            status: r.pay_refund_status as 'DUE' | 'REFUNDED',
            dueSince: iso(r.pay_refund_due_at)!,
            refundedAt: iso(r.pay_refunded_at),
          }
        : null,
  };
}

export function toBooking(r: LoadedBooking): Booking {
  const start = new Date(r.start);
  const end = new Date(r.end);
  const policy = r.cancellation_policy as unknown as CancellationPolicy;
  return {
    id: r.id,
    reference: r.reference,
    status: r.status as BookingStatus,
    paymentStatus: r.payment_status as Booking['paymentStatus'],
    paymentMethod: r.payment_method as Booking['paymentMethod'],
    channel: r.channel as Booking['channel'],
    payment: toPayment(r),
    venue: {
      id: r.venue_id,
      slug: r.venue_slug,
      name: r.venue_name as Localized,
      contactPhone: r.venue_phone,
      address: r.venue_address as Localized,
      location:
        r.venue_lat !== null && r.venue_lng !== null
          ? { lat: Number(r.venue_lat), lng: Number(r.venue_lng) }
          : null,
    },
    resource: { id: r.resource_id, name: r.resource_name as Localized, icon: r.resource_icon },
    start: start.toISOString(),
    end: end.toISOString(),
    businessDate: r.business_date,
    localStart: instantToLocal(start, r.time_zone).time,
    localEnd: instantToLocal(end, r.time_zone).time,
    timezone: r.time_zone,
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
    price: r.total === null ? null : { amount: Number(r.total), currency: r.currency },
    holdExpiresAt: r.hold_expires_at ? new Date(r.hold_expires_at).toISOString() : null,
    cancellation: {
      cutoffHours: policy.cutoffHours,
      freeUntil: freeCancellationUntil(start, policy).toISOString(),
      late: r.late_cancellation,
    },
    cancelledAt: r.cancelled_at ? new Date(r.cancelled_at).toISOString() : null,
    cancelledBy: r.cancelled_by_role as Booking['cancelledBy'],
    cancelReason: r.cancel_reason,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/** Venue staff view: includes the customer's name and phone (own bookings only). */
export function toVenueBooking(r: LoadedBooking): VenueBooking {
  const player = r.customer_user_id !== null;
  return {
    ...toBooking(r),
    customer: {
      kind: player ? 'player' : 'venue_customer',
      name: player ? r.user_name : r.vc_name,
      phone: player ? r.user_phone : r.vc_phone,
    },
    note: r.note,
    seriesId: r.series_id,
    checkedInAt: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null,
  };
}
