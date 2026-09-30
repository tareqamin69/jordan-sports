import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { localizedSchema } from './catalog.js';
import { localizedTextSchema, okSchema, uuidSchema } from './common.js';
import { membershipRoleSchema } from './identity.js';
import { venueStatusSchema } from './venues.js';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const windowSchema = z.object({
  startMinute: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(15).max(1440),
});
export const weeklyWindowSchema = windowSchema.extend({
  dayOfWeek: z.number().int().min(1).max(7),
});
export type WeeklyWindow = z.infer<typeof weeklyWindowSchema>;

export const bookingPolicySchema = z.object({
  slotDurations: z
    .array(
      z
        .number()
        .int()
        .min(15)
        .max(600)
        .refine((n) => n % 15 === 0, 'must be a multiple of 15'),
    )
    .min(1)
    .max(8),
  startAlignmentMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  minLeadMinutes: z.number().int().min(0).max(10080),
  maxAdvanceDays: z.number().int().min(1).max(365),
  bufferBeforeMinutes: z.number().int().min(0).max(120),
  bufferAfterMinutes: z.number().int().min(0).max(120),
});
export type BookingPolicy = z.infer<typeof bookingPolicySchema>;

/** A time range with venue-local labels (clients never convert venue times themselves). */
export const timeRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
  localStart: z.string(),
  localEnd: z.string(),
});

export const slotSchema = timeRangeSchema.extend({
  durationMinutes: z.number().int(),
  available: z.boolean(),
});
export type AvailabilitySlot = z.infer<typeof slotSchema>;

export const venueAvailabilitySchema = z.object({
  date: z.string(),
  timezone: z.string(),
  resources: z.array(z.object({ resourceId: uuidSchema, slots: z.array(slotSchema) })),
});
export type VenueAvailability = z.infer<typeof venueAvailabilitySchema>;

// ---------------------------------------------------------------------------------------------
// Venue management (/manage) — venue staff, authorized per organization membership
// ---------------------------------------------------------------------------------------------

export const managedVenueSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: localizedSchema,
  status: venueStatusSchema,
  statusReason: z.string().nullable(),
  organizationId: uuidSchema,
  organizationName: localizedSchema,
  role: membershipRoleSchema,
  /** First uploaded photo, if any — fetch via GET /v1/manage/media/:id (owner-scoped, works pre-approval). */
  coverMediaId: uuidSchema.nullable(),
});

export const listManagedVenues = endpoint({
  method: 'GET',
  path: '/v1/manage/venues',
  summary: 'Venues the signed-in user can manage',
  auth: 'user',
  response: z.object({ items: z.array(managedVenueSchema) }),
});

export const overrideSchema = z.object({
  id: uuidSchema,
  resourceId: uuidSchema.nullable(),
  dateFrom: dateSchema,
  dateTo: dateSchema,
  kind: z.enum(['closed', 'hours']),
  windows: z.array(windowSchema),
  note: z.string().nullable(),
});
export type ScheduleOverride = z.infer<typeof overrideSchema>;

export const venueScheduleSchema = z.object({
  venue: z.object({
    id: uuidSchema,
    slug: z.string(),
    name: localizedSchema,
    status: venueStatusSchema,
    timezone: z.string(),
    businessDayStartMinute: z.number().int(),
    closedOnPublicHolidays: z.boolean(),
    cancellationCutoffHours: z.number().int(),
    /** Refunded when a player cancels after the free window: 0, 50 or 100%. */
    lateRefundPercent: z.union([z.literal(0), z.literal(50), z.literal(100)]),
  }),
  role: membershipRoleSchema,
  permissions: z.array(z.string()),
  resources: z.array(
    z.object({
      id: uuidSchema,
      name: localizedSchema,
      status: z.enum(['active', 'inactive', 'archived']),
      weeklyHours: z.array(weeklyWindowSchema),
      policy: bookingPolicySchema,
      overlapsWith: z.array(uuidSchema),
    }),
  ),
  overrides: z.array(overrideSchema),
});
export type VenueSchedule = z.infer<typeof venueScheduleSchema>;

const venueParams = z.object({ venueId: uuidSchema });
const resourceParams = z.object({ resourceId: uuidSchema });

export const getVenueSchedule = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/schedule',
  summary: 'Opening hours, booking rules and date overrides of a venue',
  auth: 'user',
  orgPermission: 'venue.read',
  params: venueParams,
  response: venueScheduleSchema,
});

export const setWeeklyHours = endpoint({
  method: 'PUT',
  path: '/v1/manage/resources/:resourceId/weekly-hours',
  summary: 'Replace the weekly opening windows of a resource',
  auth: 'user',
  orgPermission: 'schedule.hours',
  params: resourceParams,
  body: z.object({ windows: z.array(weeklyWindowSchema).max(50) }),
  response: venueScheduleSchema,
});

export const setBookingPolicy = endpoint({
  method: 'PUT',
  path: '/v1/manage/resources/:resourceId/policy',
  summary: 'Replace the booking rules of a resource',
  auth: 'user',
  orgPermission: 'schedule.rules',
  params: resourceParams,
  body: bookingPolicySchema,
  response: venueScheduleSchema,
});

export const updateScheduleSettings = endpoint({
  method: 'PATCH',
  path: '/v1/manage/venues/:venueId/settings',
  summary: 'Venue scheduling settings',
  auth: 'user',
  orgPermission: 'schedule.rules',
  params: venueParams,
  body: z.object({
    closedOnPublicHolidays: z.boolean().optional(),
    cancellationCutoffHours: z.number().int().min(0).max(168).optional(),
    lateRefundPercent: z.union([z.literal(0), z.literal(50), z.literal(100)]).optional(),
  }),
  response: venueScheduleSchema,
});

export const createOverride = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/overrides',
  summary: 'Close or set special hours for a date range (whole venue or one resource)',
  auth: 'user',
  orgPermission: 'schedule.closures',
  params: venueParams,
  body: z.object({
    resourceId: uuidSchema.nullable().optional(),
    dateFrom: dateSchema,
    dateTo: dateSchema,
    kind: z.enum(['closed', 'hours']),
    windows: z.array(windowSchema).max(10).default([]),
    note: z.string().trim().max(300).optional(),
  }),
  response: venueScheduleSchema,
});

export const deleteOverride = endpoint({
  method: 'DELETE',
  path: '/v1/manage/overrides/:overrideId',
  summary: 'Remove a date override',
  auth: 'user',
  orgPermission: 'schedule.closures',
  params: z.object({ overrideId: uuidSchema }),
  response: venueScheduleSchema,
});

export const blockReasonSchema = z.enum([
  'maintenance',
  'closure',
  'private_event',
  'external_booking',
  'other',
]);
export type BlockReason = z.infer<typeof blockReasonSchema>;

export const calendarEntrySchema = timeRangeSchema.extend({
  id: uuidSchema,
  kind: z.enum(['block', 'booking', 'hold']),
  blockId: uuidSchema.nullable(),
  bookingId: uuidSchema.nullable(),
  reason: blockReasonSchema.nullable(),
  note: z.string().nullable(),
  /** Set when the time is taken through another resource sharing a unit (e.g. the full pitch). */
  viaResourceId: uuidSchema.nullable(),
  /** Customer name for bookings (venue staff only). */
  customerName: z.string().nullable(),
  /** Minutes from the start of the business day (for positioning in a day grid). */
  offsetMinutes: z.number().int(),
  durationMinutes: z.number().int(),
});
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

export const venueCalendarSchema = z.object({
  date: dateSchema,
  timezone: z.string(),
  dayStart: z.string(),
  dayEnd: z.string(),
  dayMinutes: z.number().int(),
  resources: z.array(
    z.object({
      id: uuidSchema,
      name: localizedSchema,
      status: z.enum(['active', 'inactive', 'archived']),
      open: z.array(
        timeRangeSchema.extend({
          offsetMinutes: z.number().int(),
          durationMinutes: z.number().int(),
        }),
      ),
      entries: z.array(calendarEntrySchema),
    }),
  ),
});
export type VenueCalendar = z.infer<typeof venueCalendarSchema>;

export const getVenueCalendar = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/calendar',
  summary: 'Day calendar: opening hours and occupied time per resource',
  auth: 'user',
  orgPermission: 'booking.read',
  params: venueParams,
  query: z.object({ date: dateSchema }),
  response: venueCalendarSchema,
});

export const createBlock = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/blocks',
  summary:
    'Block time on a resource (maintenance, private event, booking taken outside the platform…)',
  auth: 'user',
  orgPermission: 'schedule.block',
  params: venueParams,
  body: z.object({
    resourceId: uuidSchema,
    /** Venue-local calendar date and start time. */
    date: dateSchema,
    startTime: timeSchema,
    durationMinutes: z.number().int().min(15).max(1440),
    reason: blockReasonSchema,
    note: z.string().trim().max(300).optional(),
  }),
  response: z.object({ blockId: uuidSchema }),
});

export const cancelBlock = endpoint({
  method: 'DELETE',
  path: '/v1/manage/blocks/:blockId',
  summary: 'Remove a block (frees the time immediately)',
  auth: 'user',
  orgPermission: 'schedule.block',
  params: z.object({ blockId: uuidSchema }),
  response: okSchema,
});

// ---------------------------------------------------------------------------------------------
// Admin: public holidays (data, no hard-coded dates)
// ---------------------------------------------------------------------------------------------

export const holidaySchema = z.object({
  id: uuidSchema,
  countryCode: z.string(),
  date: dateSchema,
  name: localizedSchema,
});

export const adminListHolidays = endpoint({
  method: 'GET',
  path: '/v1/admin/holidays',
  summary: 'Public holidays',
  auth: 'admin',
  permission: 'venues.read',
  query: z.object({
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default('JO'),
  }),
  response: z.object({ items: z.array(holidaySchema) }),
});

export const adminCreateHoliday = endpoint({
  method: 'POST',
  path: '/v1/admin/holidays',
  summary: 'Add a public holiday',
  auth: 'admin',
  permission: 'catalog.manage',
  body: z.object({
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default('JO'),
    date: dateSchema,
    name: localizedTextSchema(120),
  }),
  response: z.object({ items: z.array(holidaySchema) }),
});

export const adminDeleteHoliday = endpoint({
  method: 'DELETE',
  path: '/v1/admin/holidays/:holidayId',
  summary: 'Remove a public holiday',
  auth: 'admin',
  permission: 'catalog.manage',
  params: z.object({ holidayId: uuidSchema }),
  response: z.object({ items: z.array(holidaySchema) }),
});
