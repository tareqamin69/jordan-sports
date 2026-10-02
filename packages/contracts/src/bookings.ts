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
 * The card payment of a marketplace booking (ADR-0020). unpaid: not started, or the last attempt
 * failed (it can be retried while the hold lasts); pending: the player is on the payment page.
 */
export const bookingPaymentSchema = z.object({
  status: z.enum(['unpaid', 'pending', 'paid']),
  amount: moneySchema,
  card: z.object({ brand: z.enum(['visa', 'mastercard']), last4: z.string() }).nullable(),
  paidAt: z.string().nullable(),
  /** Why the last attempt failed (e.g. card_declined), until a new one starts. */
  lastFailure: z.string().nullable(),
});
export type BookingPayment = z.infer<typeof bookingPaymentSchema>;

/** Money going back to the card after a cancellation. */
export const bookingRefundSchema = z.object({
  amount: moneySchema,
  status: z.enum(['pending', 'succeeded', 'failed']),
  requestedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type BookingRefund = z.infer<typeof bookingRefundSchema>;

export const bookingSchema = z.object({
  id: uuidSchema,
  reference: z.string(),
  status: bookingStatusSchema,
  paymentStatus: paymentStatusSchema,
  /** CARD for online bookings; older values are history (the retired pay-at-venue and CliQ). */
  paymentMethod: z.enum(['PAY_AT_VENUE', 'CLIQ', 'CARD']).nullable(),
  /** Card payment of an online booking; null for bookings the venue added itself. */
  payment: bookingPaymentSchema.nullable(),
  refund: bookingRefundSchema.nullable(),
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
    /** Cancelling up to this instant refunds everything. */
    freeUntil: z.string(),
    /** What a later cancellation refunds (the venue's rule when the slot was held). */
    lateRefundPercent: z.union([z.literal(0), z.literal(50), z.literal(100)]),
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

export const startCheckout = endpoint({
  method: 'POST',
  path: '/v1/bookings/:bookingId/checkout',
  summary:
    "Start paying a held booking by card: returns the gateway's payment page (card details are typed there, never sent to Jorena)",
  auth: 'user',
  params: bookingParams,
  body: z.object({
    locale: z.enum(['ar', 'en']),
    acceptCancellationPolicy: z.literal(true),
    /** Paying by card requires 18+; the confirmation is recorded with the booking. */
    confirmAdult: z.literal(true),
  }),
  response: z.object({ redirectUrl: z.string() }),
});

export const verifyCheckout = endpoint({
  method: 'POST',
  path: '/v1/bookings/:bookingId/checkout/verify',
  summary:
    'After the payment page: asks the gateway for the outcome and confirms the booking once paid',
  auth: 'user',
  params: bookingParams,
  response: bookingSchema,
});

export const cancelBooking = endpoint({
  method: 'POST',
  path: '/v1/bookings/:bookingId/cancel',
  summary:
    'Release a hold, or cancel a confirmed booking before it starts (refunded to the card: in full inside the free window, else by the venue rule)',
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
  summary:
    'Cancel a booking as the venue (reason required; the player is notified and refunded in full)',
  auth: 'user',
  orgPermission: 'booking.cancel',
  params: bookingParams,
  body: z.object({ reason: z.string().trim().min(3).max(300) }),
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
  summary:
    'Cancel a held or confirmed booking on behalf of the platform (reason required; paid bookings are refunded in full)',
  auth: 'admin',
  permission: 'bookings.cancel',
  params: z.object({ bookingId: uuidSchema }),
  body: z.object({ reason: z.string().trim().min(3).max(500) }),
  response: adminBookingDetailSchema,
});
