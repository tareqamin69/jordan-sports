import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { localizedSchema } from './catalog.js';
import { page, pageQuerySchema, uuidSchema } from './common.js';
import { moneySchema } from './pricing.js';
import { dateSchema } from './scheduling.js';

/**
 * Card payments, refunds and venue payouts (ADR-0020). Players pay Jorena by card; Jorena keeps
 * its commission and pays the rest to the venue every week. Amounts are integer minor units.
 */

// ---------------------------------------------------------------------------------------------
// Venue: earnings ("المستحقات") and the bank account for payouts
// ---------------------------------------------------------------------------------------------

/**
 * upcoming: not played yet; pending: played, goes out with the next weekly payout; due: ready to be
 * paid out now; paid: included in a payout.
 */
export const earningStatusSchema = z.enum(['upcoming', 'pending', 'due', 'paid']);
export type EarningStatus = z.infer<typeof earningStatusSchema>;

export const earningSchema = z.object({
  bookingId: uuidSchema,
  reference: z.string(),
  bookingStatus: z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']),
  businessDate: dateSchema,
  localStart: z.string(),
  resourceName: localizedSchema,
  /** Paid by the player minus any refund. */
  gross: moneySchema,
  refunded: moneySchema,
  commission: moneySchema,
  net: moneySchema,
  status: earningStatusSchema,
  payoutId: uuidSchema.nullable(),
});
export type Earning = z.infer<typeof earningSchema>;

export const payoutSchema = z.object({
  id: uuidSchema,
  venueId: uuidSchema,
  gross: moneySchema,
  commission: moneySchema,
  net: moneySchema,
  bookings: z.number().int(),
  /** Bank transfer reference. */
  reference: z.string(),
  /** Last four characters of the IBAN it went to. */
  ibanLast4: z.string(),
  paidAt: z.string(),
});
export type Payout = z.infer<typeof payoutSchema>;

export const payoutAccountSchema = z.object({
  iban: z.string(),
  holderName: z.string(),
  bankName: z.string().nullable(),
  updatedAt: z.string(),
});
export type PayoutAccount = z.infer<typeof payoutAccountSchema>;

export const venueEarningsSchema = z.object({
  /** Commission in effect for new bookings (basis points). */
  commissionBps: z.number().int(),
  /** Payouts go out weekly; this is the next payout day (venue-local date). */
  nextPayoutDate: dateSchema,
  totals: z.object({
    due: moneySchema,
    pending: moneySchema,
    upcoming: moneySchema,
    paid: moneySchema,
  }),
  /** Most recent first (last 90 days, and anything not yet paid out). */
  items: z.array(earningSchema),
  payouts: z.array(payoutSchema),
  /** Masked for everyone but the owner; null until the owner adds one. */
  account: z.object({ ibanMasked: z.string(), holderName: z.string() }).nullable(),
});
export type VenueEarnings = z.infer<typeof venueEarningsSchema>;

const venueParams = z.object({ venueId: uuidSchema });

export const getVenueEarnings = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/earnings',
  summary: 'What the venue earned from card bookings: per booking, totals and payout history',
  auth: 'user',
  orgPermission: 'reports.read',
  params: venueParams,
  response: venueEarningsSchema,
});

/** Jordanian IBAN, spaces allowed while typing (checked with the ISO 13616 checksum too). */
export const ibanInputSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .pipe(z.string().regex(/^JO[0-9]{2}[A-Z]{4}[0-9A-Z]{22}$/, 'Must be a Jordanian IBAN (JO…)'));

export const getPayoutAccount = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/payout-account',
  summary: "The organization's bank account for payouts (owner only)",
  auth: 'user',
  orgPermission: 'payouts.manage',
  params: venueParams,
  response: z.object({ account: payoutAccountSchema.nullable() }),
});

export const setPayoutAccount = endpoint({
  method: 'PUT',
  path: '/v1/manage/venues/:venueId/payout-account',
  summary: "Set the organization's bank account for payouts (owner only, audited)",
  auth: 'user',
  orgPermission: 'payouts.manage',
  params: venueParams,
  body: z.object({
    iban: ibanInputSchema,
    holderName: z.string().trim().min(2).max(120),
    bankName: z.string().trim().min(2).max(80).nullable().optional(),
  }),
  response: z.object({ account: payoutAccountSchema.nullable() }),
});

// ---------------------------------------------------------------------------------------------
// Admin: payouts, refunds and gateway transactions
// ---------------------------------------------------------------------------------------------

export const duePayoutSchema = z.object({
  venueId: uuidSchema,
  venueName: localizedSchema,
  organizationName: localizedSchema,
  gross: moneySchema,
  commission: moneySchema,
  net: moneySchema,
  bookings: z.number().int(),
  account: z
    .object({ iban: z.string(), holderName: z.string(), bankName: z.string().nullable() })
    .nullable(),
});
export type DuePayout = z.infer<typeof duePayoutSchema>;

export const adminPayoutSchema = payoutSchema.extend({
  venueName: localizedSchema,
  paidBy: z.string().nullable(),
});

export const adminListPayouts = endpoint({
  method: 'GET',
  path: '/v1/admin/payouts',
  summary: 'Payouts due to venues now (bookings played before this week) and recent payouts',
  auth: 'admin',
  permission: 'revenue.read',
  response: z.object({
    /** Bookings played up to the end of this date are included in the due amounts. */
    cutoffDate: dateSchema,
    due: z.array(duePayoutSchema),
    paid: z.array(adminPayoutSchema),
  }),
});

export const adminMarkPayoutPaid = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/payouts',
  summary:
    "Record the bank transfer of a venue's due amount (re-authentication, audited). Refused if the amount changed since it was shown.",
  auth: 'admin',
  permission: 'finance.manage',
  params: venueParams,
  body: z.object({
    reference: z.string().trim().min(3).max(80),
    /** The net amount the admin saw; guards against paying a stale figure. */
    expectedNet: z.number().int().min(1),
  }),
  response: adminPayoutSchema,
});

export const transactionSchema = z.object({
  id: uuidSchema,
  kind: z.enum(['charge', 'refund']),
  status: z.enum(['pending', 'succeeded', 'failed']),
  amount: moneySchema,
  gateway: z.string(),
  gatewayRef: z.string().nullable(),
  card: z.object({ brand: z.string(), last4: z.string() }).nullable(),
  failureCode: z.string().nullable(),
  reason: z.enum(['customer_free', 'customer_late', 'venue', 'admin', 'expired']).nullable(),
  attempts: z.number().int(),
  bookingId: uuidSchema,
  bookingReference: z.string(),
  venueName: localizedSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const adminListTransactions = endpoint({
  method: 'GET',
  path: '/v1/admin/payments/transactions',
  summary: 'Card gateway transactions (charges and refunds), newest first',
  auth: 'admin',
  permission: 'revenue.read',
  query: pageQuerySchema.extend({
    kind: z.enum(['charge', 'refund']).optional(),
    status: z.enum(['pending', 'succeeded', 'failed']).optional(),
    /** Booking reference. */
    q: z.string().trim().max(20).optional(),
  }),
  response: page(transactionSchema),
});

export const adminRetryRefund = endpoint({
  method: 'POST',
  path: '/v1/admin/payments/refunds/:transactionId/retry',
  summary: 'Send a failed refund to the gateway again (re-authentication, audited)',
  auth: 'admin',
  permission: 'finance.manage',
  params: z.object({ transactionId: uuidSchema }),
  response: transactionSchema,
});

// ---------------------------------------------------------------------------------------------
// Test payment page of the mock gateway (staging only; absent when a real gateway is configured)
// ---------------------------------------------------------------------------------------------

export const mockCheckoutSchema = z.object({
  amount: moneySchema,
  description: z.string(),
  status: z.enum(['pending', 'succeeded', 'failed']),
  /** Last problem: invalid_card / invalid_expiry / invalid_cvc (retry), or why it failed. */
  failureCode: z.string().nullable(),
  /** Back to the booking (after paying or cancelling). */
  returnUrl: z.string(),
});
export type MockCheckout = z.infer<typeof mockCheckoutSchema>;

const sessionParams = z.object({ sessionId: uuidSchema });

export const getMockCheckout = endpoint({
  method: 'GET',
  path: '/v1/mock-gateway/sessions/:sessionId',
  summary: 'Test payment page: the checkout session',
  auth: 'public',
  params: sessionParams,
  response: mockCheckoutSchema,
});

export const payMockCheckout = endpoint({
  method: 'POST',
  path: '/v1/mock-gateway/sessions/:sessionId/pay',
  summary: 'Test payment page: pay with a test card',
  auth: 'public',
  params: sessionParams,
  body: z.object({
    number: z.string().trim().max(30),
    expiry: z.string().trim().max(7),
    cvc: z.string().trim().max(4),
  }),
  response: mockCheckoutSchema,
});

export const cancelMockCheckout = endpoint({
  method: 'POST',
  path: '/v1/mock-gateway/sessions/:sessionId/cancel',
  summary: 'Test payment page: go back without paying',
  auth: 'public',
  params: sessionParams,
  response: mockCheckoutSchema,
});
