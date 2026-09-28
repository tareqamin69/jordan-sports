import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { uuidSchema } from './common.js';
import { moneySchema } from './pricing.js';

/** Prepaid commission balance of an organization (plan §5). Amounts in minor units. */
export const balanceEntrySchema = z.object({
  id: uuidSchema,
  kind: z.enum(['topup', 'commission', 'commission_reversal', 'adjustment']),
  amount: moneySchema,
  balanceAfter: moneySchema,
  bookingReference: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type BalanceEntry = z.infer<typeof balanceEntrySchema>;

export const balanceSchema = z.object({
  organizationId: uuidSchema,
  balance: moneySchema,
  lowBalanceThreshold: moneySchema,
  /** ok: at or above the threshold; low: below it; empty: zero or less (venues hidden). */
  level: z.enum(['ok', 'low', 'empty']),
  /** False while the balance is empty or a refund is overdue: CliQ venues are hidden from search. */
  takingOnlineBookings: z.boolean(),
  /**
   * Whether the venue asked about takes CliQ (the balance rules only apply then); null in the
   * organization-wide admin view.
   */
  cliqEnabled: z.boolean().nullable(),
  /** Deposits cancelled more than 48 hours ago that the venue has not marked refunded. */
  overdueRefunds: z.number().int(),
  entries: z.array(balanceEntrySchema),
});
export type Balance = z.infer<typeof balanceSchema>;

export const getVenueBalance = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/balance',
  summary: "Commission balance of the venue's organization, with recent history",
  auth: 'user',
  orgPermission: 'reports.read',
  params: z.object({ venueId: uuidSchema }),
  response: balanceSchema,
});

const organizationParams = z.object({ organizationId: uuidSchema });

export const adminGetBalance = endpoint({
  method: 'GET',
  path: '/v1/admin/organizations/:organizationId/balance',
  summary: 'Commission balance of an organization',
  auth: 'admin',
  permission: 'revenue.read',
  params: organizationParams,
  response: balanceSchema,
});

export const adminAdjustBalance = endpoint({
  method: 'POST',
  path: '/v1/admin/organizations/:organizationId/balance/adjustments',
  summary: 'Credit (positive) or debit (negative) a balance by hand, with a reason (audited)',
  auth: 'admin',
  permission: 'finance.manage',
  params: organizationParams,
  body: z.object({
    amount: z
      .number()
      .int()
      .refine((n) => n !== 0, 'Amount must not be zero')
      .refine((n) => Math.abs(n) <= 100_000_000, 'Amount too large'),
    reason: z.string().trim().min(3).max(300),
  }),
  response: balanceSchema,
});
