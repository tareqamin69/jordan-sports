import { z } from 'zod';
import { okSchema, uuidSchema } from './common.js';
import { endpoint } from './endpoint.js';
import { moneySchema } from './pricing.js';

const venueParams = z.object({ venueId: uuidSchema });

// ---------------------------------------------------------------------------------------------
// The owner's private rating and notes per venue (docs/rbac-plan.md §7.3). Never public.
// ---------------------------------------------------------------------------------------------

export const venueRatingTags = [
  'reliable',
  'slow_to_reply',
  'complaints',
  'cancels_often',
  'great_facilities',
  'pricing_issues',
  'recommended',
] as const;
export const venueRatingTagSchema = z.enum(venueRatingTags);
export type VenueRatingTag = z.infer<typeof venueRatingTagSchema>;

export const venueRatingSchema = z.object({
  id: uuidSchema,
  score: z.number().int().min(1).max(5),
  tags: z.array(venueRatingTagSchema),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type VenueRating = z.infer<typeof venueRatingSchema>;

export const venueRatingHistorySchema = z.object({
  current: venueRatingSchema.nullable(),
  history: z.array(venueRatingSchema),
});

export const adminGetVenueRating = endpoint({
  method: 'GET',
  path: '/v1/admin/venues/:venueId/rating',
  summary: "The owner's private rating of a venue, with history",
  auth: 'admin',
  permission: 'venues.rate',
  params: venueParams,
  response: venueRatingHistorySchema,
});

export const adminRateVenue = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/rating',
  summary: 'Record a new private rating (score, tags, note); earlier ones stay in the history',
  auth: 'admin',
  permission: 'venues.rate',
  privateBody: true,
  params: venueParams,
  body: z.object({
    score: z.number().int().min(1).max(5),
    tags: z.array(venueRatingTagSchema).max(venueRatingTags.length).default([]),
    note: z.string().trim().max(2000).optional(),
  }),
  response: venueRatingHistorySchema,
});

// ---------------------------------------------------------------------------------------------
// Archive (soft delete only): confirmed by typing the venue's name.
// ---------------------------------------------------------------------------------------------

export const archiveVenueBodySchema = z.object({
  /** The venue's Arabic or English name, typed to confirm. */
  confirmName: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3).max(500),
});

export const adminArchiveVenue = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/archive',
  summary: 'Archive a venue (owner only, re-authentication; refused with upcoming bookings)',
  auth: 'admin',
  permission: 'venues.archive',
  params: venueParams,
  body: archiveVenueBodySchema,
  response: okSchema,
});

export const archiveOwnVenue = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/archive',
  summary: 'Venue owner: archive the venue (refused with upcoming bookings)',
  auth: 'user',
  orgPermission: 'venue.archive',
  params: venueParams,
  body: archiveVenueBodySchema,
  response: okSchema,
});

// ---------------------------------------------------------------------------------------------
// Venue performance
// ---------------------------------------------------------------------------------------------

export const venueStatsSchema = z.object({
  from: z.string(),
  to: z.string(),
  bookings: z.object({
    total: z.number().int(),
    confirmed: z.number().int(),
    completed: z.number().int(),
    cancelled: z.number().int(),
    lateCancellations: z.number().int(),
    noShows: z.number().int(),
    online: z.number().int(),
    byVenue: z.number().int(),
  }),
  /** Value of kept bookings; null for roles without revenue access. */
  revenue: moneySchema.nullable(),
});
export type VenueStats = z.infer<typeof venueStatsSchema>;

export const adminGetVenueStats = endpoint({
  method: 'GET',
  path: '/v1/admin/venues/:venueId/stats',
  summary: 'Booking performance of a venue over the last N days',
  auth: 'admin',
  permission: 'venues.read',
  params: venueParams,
  query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
  response: venueStatsSchema,
});

// ---------------------------------------------------------------------------------------------
// Review summary: what a reviewer needs at a glance before approving (hours and prices).
// ---------------------------------------------------------------------------------------------

export const venueReviewSummarySchema = z.object({
  resources: z.array(
    z.object({
      id: uuidSchema,
      status: z.enum(['active', 'inactive', 'archived']),
      weeklyHours: z.array(
        z.object({
          dayOfWeek: z.number().int().min(1).max(7),
          startMinute: z.number().int(),
          durationMinutes: z.number().int(),
        }),
      ),
      prices: z.array(
        z.object({
          daysOfWeek: z.array(z.number().int()),
          startMinute: z.number().int(),
          endMinute: z.number().int(),
          currency: z.string(),
          amounts: z.array(
            z.object({ durationMinutes: z.number().int(), amount: z.number().int() }),
          ),
        }),
      ),
    }),
  ),
});
export type VenueReviewSummary = z.infer<typeof venueReviewSummarySchema>;

export const adminGetVenueReviewSummary = endpoint({
  method: 'GET',
  path: '/v1/admin/venues/:venueId/review-summary',
  summary: "Opening hours and prices of every court of a venue, for the reviewer's summary",
  auth: 'admin',
  permission: 'venues.read',
  params: venueParams,
  response: venueReviewSummarySchema,
});
