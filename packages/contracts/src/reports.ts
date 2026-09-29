import { z } from 'zod';
import { uuidSchema } from './common.js';
import { localizedSchema } from './catalog.js';
import { endpoint } from './endpoint.js';
import { moneySchema } from './pricing.js';
import { dateSchema } from './scheduling.js';

export const reportPeriodSchema = z.enum(['today', 'week', 'month']);
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

export const overviewSchema = z.object({
  period: reportPeriodSchema,
  /** Business dates in Amman, inclusive. */
  from: dateSchema,
  to: dateSchema,
  totals: z.object({
    /** Bookings made in the period (players and venues). */
    bookings: z.number().int(),
    online: z.number().int(),
    cancellations: z.number().int(),
    noShows: z.number().int(),
    newUsers: z.number().int(),
    newVenues: z.number().int(),
    openComplaints: z.number().int(),
    pendingVenues: z.number().int(),
  }),
  /** Value of kept bookings made in the period and the commission on online ones (revenue.read). */
  revenue: z.object({ bookingValue: moneySchema, commission: moneySchema }).nullable(),
  /** One point per day (the last 14 days for "today"). */
  daily: z.array(
    z.object({
      date: dateSchema,
      bookings: z.number().int(),
      bookingValue: z.number().int().nullable(),
    }),
  ),
  topVenues: z.array(
    z.object({ venueId: uuidSchema, name: localizedSchema, bookings: z.number().int() }),
  ),
  topAreas: z.array(
    z.object({
      governorate: localizedSchema,
      area: localizedSchema.nullable(),
      bookings: z.number().int(),
    }),
  ),
});
export type Overview = z.infer<typeof overviewSchema>;

export const adminReportsOverview = endpoint({
  method: 'GET',
  path: '/v1/admin/reports/overview',
  summary: 'Dashboard figures for today, the last 7 or the last 30 days',
  auth: 'admin',
  permission: 'reports.read',
  query: z.object({ period: reportPeriodSchema.default('week') }),
  response: overviewSchema,
});

const exportRange = z.object({ from: dateSchema, to: dateSchema });

export const adminExportBookings = endpoint({
  method: 'GET',
  path: '/v1/admin/reports/bookings.csv',
  summary: 'CSV of bookings between two business dates (finance export)',
  auth: 'admin',
  permission: 'revenue.read',
  query: exportRange,
  response: z.string(),
});

export const adminExportAuditLogs = endpoint({
  method: 'GET',
  path: '/v1/admin/audit-logs.csv',
  summary: 'CSV of the audit log with the same filters as the list',
  auth: 'admin',
  permission: 'audit.read',
  query: z.object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    action: z.string().trim().max(100).optional(),
    actorUserId: uuidSchema.optional(),
    targetType: z.string().trim().max(50).optional(),
    targetId: z.string().trim().max(100).optional(),
    organizationId: uuidSchema.optional(),
  }),
  response: z.string(),
});
