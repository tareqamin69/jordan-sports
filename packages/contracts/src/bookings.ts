import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { localizedSchema } from './catalog.js';
import { page, pageQuerySchema, uuidSchema } from './common.js';
import { moneySchema } from './pricing.js';
import { dateSchema, timeSchema } from './scheduling.js';

export const bookingStatusSchema = z.enum([
  'HELD',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
  'NO_SHOW',
]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export const paymentStatusSchema = z.enum([
  'NOT_REQUIRED',
  'UNPAID',
  'DEPOSIT_PAID',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

/**
 * A CliQ payment straight to the venue (plan §4). AWAITING_PROOF: the player still has to send the
 * transfer reference; SUBMITTED: waiting for the venue to confirm it arrived.
 */
export const bookingPaymentSchema = z.object({
  id: uuidSchema,
  provider: z.literal('CLIQ_MANUAL'),
  status: z.enum(['AWAITING_PROOF', 'SUBMITTED', 'CONFIRMED', 'EXPIRED', 'CANCELLED']),
  /** Due now by CliQ (the deposit). */
  amount: moneySchema,
  /** Paid at the venue (booking price minus the deposit). */
  remainder: moneySchema,
  payee: z.object({ alias: z.string(), holderName: z.string().nullable() }),
  reference: z.string().nullable(),
  submittedAt: z.string().nullable(),
  /** The venue's last "not received" answer, until new proof is sent. */
  rejectReason: z.string().nullable(),
  /** The venue owes the deposit back (cancelled in the free window, or by the venue). */
  refund: z
    .object({
      status: z.enum(['DUE', 'REFUNDED']),
      dueSince: z.string(),
      refundedAt: z.string().nullable(),
    })
    .nullable(),
});
export type BookingPayment = z.infer<typeof bookingPaymentSchema>;

export const bookingSchema = z.object({
  id: uuidSchema,
  reference: z.string(),
  status: bookingStatusSchema,
  paymentStatus: paymentStatusSchema,
  paymentMethod: z.enum(['PAY_AT_VENUE', 'CLIQ']).nullable(),
  /** Set for bookings at venues that take CliQ; null for pay-at-venue and manual bookings. */
  payment: bookingPaymentSchema.nullable(),
  channel: z.enum(['MARKETPLACE', 'VENUE_MANUAL']),
  venue: z.object({
    id: uuidSchema,
    slug: z.string(),
    name: localizedSchema,
    contactPhone: z.string().nullable(),
    address: localizedSchema,
    location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  }),
  resource: z.object({
    id: uuidSchema,
    name: localizedSchema,
    /** Icon key of the resource's sport (catalog data), so booking art can match the sport. */
    icon: z.string().nullable(),
  }),
  start: z.string(),
  end: z.string(),
  /** Business date and venue-local times (clients never convert venue times). */
  businessDate: dateSchema,
  localStart: z.string(),
  localEnd: z.string(),
  timezone: z.string(),
  durationMinutes: z.number().int(),
  price: moneySchema.nullable(),
  holdExpiresAt: z.string().nullable(),
  cancellation: z.object({
    cutoffHours: z.number().int(),
    /** Cancelling after this instant is recorded as a late cancellation. */
    freeUntil: z.string(),
    late: z.boolean().nullable(),
  }),
  cancelledAt: z.string().nullable(),
  cancelledBy: z.enum(['customer', 'venue', 'admin', 'system']).nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
});
export type Booking = z.infer<typeof bookingSchema>;

const bookingParams = z.object({ bookingId: uuidSchema });

export const createBookingHold = endpoint({
  method: 'POST',
  path: '/v1/bookings',
  summary:
    'Hold a slot for the signed-in player (expires after the venue hold time, default 10 minutes)',
  auth: 'user',
  idempotent: true,
  body: z.object({
    resourceId: uuidSchema,
    /** Slot start instant (ISO 8601) as returned by availability. */
    start: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(600),
  }),
  response: bookingSchema,
});

export const getBooking = endpoint({
  method: 'GET',
  path: '/v1/bookings/:bookingId',
  summary: 'A booking of the signed-in player',
  auth: 'user',
  params: bookingParams,
  response: bookingSchema,
});

export const confirmBooking = endpoint({
  method: 'POST',
  path: '/v1/bookings/:bookingId/confirm',
  summary: 'Confirm a held booking (payment at the venue until online payment exists)',
  auth: 'user',
  idempotent: true,
  params: bookingParams,
  body: z.object({
    paymentMethod: z.literal('PAY_AT_VENUE'),
    acceptCancellationPolicy: z.literal(true),
  }),
  response: bookingSchema,
});

export const submitPaymentProof = endpoint({
  method: 'POST',
  path: '/v1/bookings/:bookingId/payment-proof',
  summary:
    'Send the CliQ transfer reference for a held booking; the venue then has the hold time again to confirm it',
  auth: 'user',
  idempotent: true,
  params: bookingParams,
  body: z.object({ reference: z.string().trim().min(4).max(40) }),
  response: bookingSchema,
});

export const cancelBooking = endpoint({
  method: 'POST',
  path: '/v1/bookings/:bookingId/cancel',
  summary: 'Release a hold or cancel a confirmed booking before it starts',
  auth: 'user',
  params: bookingParams,
  body: z.object({ reason: z.string().trim().max(300).optional() }),
  response: bookingSchema,
});

export const listMyBookings = endpoint({
  method: 'GET',
  path: '/v1/me/bookings',
  summary: 'Bookings of the signed-in player',
  auth: 'user',
  query: z.object({ scope: z.enum(['upcoming', 'past']).default('upcoming') }),
  response: z.object({ items: z.array(bookingSchema) }),
});

// ---------------------------------------------------------------------------------------------
// Venue staff
// ---------------------------------------------------------------------------------------------

export const venueBookingSchema = bookingSchema.extend({
  customer: z.object({
    kind: z.enum(['player', 'venue_customer']),
    name: z.string().nullable(),
    /** Shared with the venue for its own bookings only (approved product decision). */
    phone: z.string().nullable(),
  }),
  note: z.string().nullable(),
  seriesId: uuidSchema.nullable(),
  checkedInAt: z.string().nullable(),
});
export type VenueBooking = z.infer<typeof venueBookingSchema>;

const venueParams = z.object({ venueId: uuidSchema });

export const listVenueBookings = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/bookings',
  summary: 'Bookings of a venue between two business dates',
  auth: 'user',
  orgPermission: 'booking.read',
  params: venueParams,
  query: z.object({ from: dateSchema, to: dateSchema }),
  response: z.object({ items: z.array(venueBookingSchema) }),
});

export const createManualBooking = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/bookings',
  summary: 'Add a booking taken by phone or in person, optionally repeating weekly',
  auth: 'user',
  orgPermission: 'booking.create',
  params: venueParams,
  body: z.object({
    resourceId: uuidSchema,
    /** Venue-local calendar date and start time of the first booking. */
    date: dateSchema,
    startTime: timeSchema,
    durationMinutes: z.number().int().min(15).max(600),
    customer: z.object({
      name: z.string().trim().min(1).max(80),
      phone: z.string().trim().max(20).optional(),
    }),
    note: z.string().trim().max(300).optional(),
    /** 1 = single booking; up to 26 weekly occurrences. */
    repeatWeeks: z.number().int().min(1).max(26).default(1),
  }),
  response: z.object({
    created: z.array(venueBookingSchema),
    /** Occurrences not created because the time was taken. */
    skipped: z.array(z.object({ date: dateSchema, reason: z.enum(['SLOT_UNAVAILABLE']) })),
    seriesId: uuidSchema.nullable(),
  }),
});

export const cancelVenueBooking = endpoint({
  method: 'POST',
  path: '/v1/manage/bookings/:bookingId/cancel',
  summary: 'Cancel a booking as the venue (reason required; the player is notified)',
  auth: 'user',
  orgPermission: 'booking.cancel',
  params: bookingParams,
  body: z.object({ reason: z.string().trim().min(3).max(300) }),
  response: venueBookingSchema,
});

const paymentParams = z.object({ paymentId: uuidSchema });

export const listVenuePayments = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/payments',
  summary: 'CliQ payments waiting for the venue: transfers to confirm and deposits to refund',
  auth: 'user',
  orgPermission: 'payments.manage',
  params: venueParams,
  response: z.object({
    toConfirm: z.array(venueBookingSchema),
    refundsDue: z.array(venueBookingSchema),
  }),
});

export const confirmVenuePayment = endpoint({
  method: 'POST',
  path: '/v1/manage/payments/:paymentId/confirm',
  summary: '"وصلت الدفعة": the transfer arrived; confirms the booking and deducts the commission',
  auth: 'user',
  orgPermission: 'payments.manage',
  params: paymentParams,
  response: venueBookingSchema,
});

export const rejectVenuePayment = endpoint({
  method: 'POST',
  path: '/v1/manage/payments/:paymentId/reject',
  summary: 'The transfer did not arrive: back to awaiting payment, with the reason for the player',
  auth: 'user',
  orgPermission: 'payments.manage',
  params: paymentParams,
  body: z.object({ reason: z.string().trim().min(3).max(300) }),
  response: venueBookingSchema,
});

export const markPaymentRefunded = endpoint({
  method: 'POST',
  path: '/v1/manage/payments/:paymentId/refunded',
  summary: 'The venue sent the deposit back to the player by CliQ',
  auth: 'user',
  orgPermission: 'payments.manage',
  params: paymentParams,
  response: venueBookingSchema,
});

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

export const adminListBookings = endpoint({
  method: 'GET',
  path: '/v1/admin/bookings',
  summary: 'Bookings across the platform (newest first)',
  auth: 'admin',
  permission: 'bookings.read',
  query: pageQuerySchema.extend({
    venueId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    status: z.enum(['HELD', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
    /** Business dates (venue-local), inclusive. */
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    /** Booking reference, or the customer's name or phone. */
    q: z.string().trim().max(100).optional(),
  }),
  response: page(venueBookingSchema),
});

export const adminBookingDetailSchema = venueBookingSchema.extend({
  customerUserId: uuidSchema.nullable(),
  history: z.array(
    z.object({
      from: z.string().nullable(),
      to: z.string(),
      actorType: z.string(),
      reason: z.string().nullable(),
      at: z.string(),
    }),
  ),
});
export type AdminBookingDetail = z.infer<typeof adminBookingDetailSchema>;

export const adminGetBooking = endpoint({
  method: 'GET',
  path: '/v1/admin/bookings/:bookingId',
  summary: 'One booking with its status history',
  auth: 'admin',
  permission: 'bookings.read',
  params: z.object({ bookingId: uuidSchema }),
  response: adminBookingDetailSchema,
});

export const adminCancelBooking = endpoint({
  method: 'POST',
  path: '/v1/admin/bookings/:bookingId/cancel',
  summary: 'Cancel a held or confirmed booking on behalf of the platform (reason required)',
  auth: 'admin',
  permission: 'bookings.cancel',
  params: z.object({ bookingId: uuidSchema }),
  body: z.object({ reason: z.string().trim().min(3).max(500) }),
  response: adminBookingDetailSchema,
});
