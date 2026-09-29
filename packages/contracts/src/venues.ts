import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { localizedSchema } from './catalog.js';
import {
  localizedTextSchema,
  page,
  pageQuerySchema,
  reasonSchemaBase,
  slugSchema,
  uuidSchema,
} from './common.js';
import { phoneInputSchema } from './identity.js';

export const venueStatusSchema = z.enum([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'suspended',
]);
export type VenueStatus = z.infer<typeof venueStatusSchema>;

export const mediaSchema = z.object({
  id: uuidSchema,
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
export type Media = z.infer<typeof mediaSchema>;

const namedRef = z.object({ id: uuidSchema, key: z.string(), name: localizedSchema });

/** A resource attribute resolved for display: label plus the chosen option (null for yes/no). */
export const featureSchema = z.object({
  key: z.string(),
  label: localizedSchema,
  value: localizedSchema.nullable(),
});

export const publicResourceSchema = z.object({
  id: uuidSchema,
  name: localizedSchema,
  type: namedRef,
  formats: z.array(namedRef.extend({ sportKey: z.string(), sportName: localizedSchema })),
  features: z.array(featureSchema),
  /** Number of atomic units: >1 means this resource combines others (e.g. a full pitch). */
  unitCount: z.number().int(),
});
export type PublicResource = z.infer<typeof publicResourceSchema>;

// Defined here (not imported from pricing) to keep the contracts module graph acyclic.
const money = z.object({ amount: z.number().int(), currency: z.string().length(3) });

export const venueSummarySchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: localizedSchema,
  governorate: namedRef,
  area: namedRef.nullable(),
  sports: z.array(namedRef.extend({ icon: z.string() })),
  cover: mediaSchema.nullable(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  /** Lowest price for the shortest bookable length ("from 20.000 JOD"). */
  priceFrom: money.extend({ durationMinutes: z.number().int() }).nullable(),
  /** Free start times on the searched date (only when `date` is given), nearest to `time` first. */
  freeTimes: z
    .array(
      z.object({
        start: z.string(),
        localStart: z.string(),
        durationMinutes: z.number().int(),
        price: money,
      }),
    )
    .optional(),
});
export type VenueSummary = z.infer<typeof venueSummarySchema>;

export const publicVenueSchema = venueSummarySchema.extend({
  description: localizedSchema,
  address: localizedSchema,
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  contactPhone: z.string().nullable(),
  timezone: z.string(),
  currency: z.string(),
  amenities: z.array(namedRef),
  media: z.array(mediaSchema),
  resources: z.array(publicResourceSchema),
});
export type PublicVenue = z.infer<typeof publicVenueSchema>;

export const listVenues = endpoint({
  method: 'GET',
  path: '/v1/venues',
  summary: 'Approved venues, filterable by sport, governorate and area',
  auth: 'public',
  query: pageQuerySchema.extend({
    sport: z.string().max(40).optional(),
    governorate: z.string().max(40).optional(),
    area: z.string().max(40).optional(),
    /** Only venues with a free, priced time on this business date (YYYY-MM-DD). */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** Preferred start time (HH:mm) with `date`: free times within about two hours. */
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
  }),
  response: page(venueSummarySchema),
});

export const getVenue = endpoint({
  method: 'GET',
  path: '/v1/venues/:slug',
  summary: 'An approved venue with its resources',
  auth: 'public',
  params: z.object({ slug: z.string().max(60) }),
  response: publicVenueSchema,
});

// ---------------------------------------------------------------------------------------------
// Admin (pilot: venues are created and approved by the platform team)
// ---------------------------------------------------------------------------------------------

const locationInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const venueProfileInputSchema = z.object({
  slug: slugSchema,
  name: localizedTextSchema(120),
  description: localizedTextSchema(2000).optional(),
  governorateId: uuidSchema,
  areaId: uuidSchema.nullable().optional(),
  address: localizedTextSchema(300).optional(),
  location: locationInput.nullable().optional(),
  contactPhone: phoneInputSchema.nullable().optional(),
  amenityIds: z.array(uuidSchema).max(50).default([]),
  businessDayStartMinute: z.number().int().min(0).max(720).optional(),
  // Self-registration (plan §3, wizard step 8-9). Configuration only — no CliQ payment
  // processing exists yet (P4).
  whatsapp: phoneInputSchema.nullable().optional(),
  cliqAlias: z.string().trim().min(1).max(60).nullable().optional(),
  cliqAliasHolderName: z.string().trim().min(1).max(120).nullable().optional(),
  depositPercentage: z.number().int().min(0).max(100).nullable().optional(),
});
export type VenueProfileInput = z.input<typeof venueProfileInputSchema>;

export const adminResourceSchema = publicResourceSchema.extend({
  status: z.enum(['active', 'inactive', 'archived']),
  facilityId: uuidSchema.nullable(),
  resourceTypeId: uuidSchema,
  sportFormatIds: z.array(uuidSchema),
  attributes: z.record(z.string(), z.union([z.string(), z.boolean()])),
  unitIds: z.array(uuidSchema),
  /** Other resources of the venue that share at least one unit (cannot be booked at the same time). */
  overlapsWith: z.array(uuidSchema),
});
export type AdminResource = z.infer<typeof adminResourceSchema>;

export const adminVenueSchema = z.object({
  id: uuidSchema,
  organizationId: uuidSchema,
  slug: z.string(),
  name: localizedSchema,
  description: localizedSchema,
  status: venueStatusSchema,
  /** Set on the latest status change — most useful for 'rejected' (why, so it can be fixed). */
  statusReason: z.string().nullable(),
  timezone: z.string(),
  currency: z.string(),
  governorateId: uuidSchema,
  areaId: uuidSchema.nullable(),
  address: localizedSchema,
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  contactPhone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  cliqAlias: z.string().nullable(),
  cliqAliasHolderName: z.string().nullable(),
  depositPercentage: z.number().int().nullable(),
  /** Commission in effect (basis points): the venue's own rate or the platform default. */
  commissionBps: z.number().int(),
  businessDayStartMinute: z.number().int(),
  amenityIds: z.array(uuidSchema),
  facilities: z.array(z.object({ id: uuidSchema, name: localizedSchema })),
  resources: z.array(adminResourceSchema),
  media: z.array(mediaSchema),
  /** Owner contact, for the admin review queue's call/WhatsApp buttons. */
  ownerName: z.string().nullable(),
  ownerPhone: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminVenue = z.infer<typeof adminVenueSchema>;

export const adminVenueListItemSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: localizedSchema,
  status: venueStatusSchema,
  resourceCount: z.number().int(),
});

const venueParams = z.object({ venueId: uuidSchema });

export const adminListVenues = endpoint({
  method: 'GET',
  path: '/v1/admin/organizations/:organizationId/venues',
  summary: 'Venues of an organization',
  auth: 'admin',
  permission: 'venues.read',
  params: z.object({ organizationId: uuidSchema }),
  response: z.object({ items: z.array(adminVenueListItemSchema) }),
});

export const adminCreateVenue = endpoint({
  method: 'POST',
  path: '/v1/admin/organizations/:organizationId/venues',
  summary: 'Create a venue (draft)',
  auth: 'admin',
  permission: 'venues.edit',
  params: z.object({ organizationId: uuidSchema }),
  body: venueProfileInputSchema,
  response: adminVenueSchema,
});

export const adminGetVenue = endpoint({
  method: 'GET',
  path: '/v1/admin/venues/:venueId',
  summary: 'Venue with facilities, resources and media',
  auth: 'admin',
  permission: 'venues.read',
  params: venueParams,
  response: adminVenueSchema,
});

export const adminUpdateVenue = endpoint({
  method: 'PATCH',
  path: '/v1/admin/venues/:venueId',
  summary: 'Update the venue profile',
  auth: 'admin',
  permission: 'venues.edit',
  params: venueParams,
  body: venueProfileInputSchema.partial(),
  response: adminVenueSchema,
});

export const adminSetVenueStatus = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/status',
  summary: 'Approve, reject, suspend or reopen a venue (audited)',
  auth: 'admin',
  permission: 'venues.review',
  params: venueParams,
  body: reasonSchemaBase.extend({ status: venueStatusSchema }),
  response: adminVenueSchema,
});

export const adminCreateFacility = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/facilities',
  summary: 'Add a facility (a group of resources)',
  auth: 'admin',
  permission: 'venues.edit',
  params: venueParams,
  body: z.object({ name: localizedTextSchema(120) }),
  response: adminVenueSchema,
});

export const resourceInputSchema = z.object({
  name: localizedTextSchema(120),
  resourceTypeId: uuidSchema,
  facilityId: uuidSchema.nullable().optional(),
  sportFormatIds: z.array(uuidSchema).min(1).max(20),
  attributes: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
  /**
   * Build this resource from existing ones (e.g. a full pitch from its two halves): it occupies
   * all of their units, so it can never be booked at the same time as any of them.
   */
  combinesResourceIds: z.array(uuidSchema).max(8).optional(),
});

export const adminCreateResource = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/resources',
  summary: 'Add a bookable resource',
  auth: 'admin',
  permission: 'venues.edit',
  params: venueParams,
  body: resourceInputSchema,
  response: adminVenueSchema,
});

export const adminUpdateResource = endpoint({
  method: 'PATCH',
  path: '/v1/admin/resources/:resourceId',
  summary: 'Update a resource',
  auth: 'admin',
  permission: 'venues.edit',
  params: z.object({ resourceId: uuidSchema }),
  body: z.object({
    name: localizedTextSchema(120).optional(),
    facilityId: uuidSchema.nullable().optional(),
    sportFormatIds: z.array(uuidSchema).min(1).max(20).optional(),
    attributes: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    status: z.enum(['active', 'inactive', 'archived']).optional(),
  }),
  response: adminVenueSchema,
});

export const adminUploadVenueMedia = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/media',
  summary: 'Upload a venue photo (JPEG, PNG or WebP body; stored as WebP without metadata)',
  auth: 'admin',
  permission: 'venues.edit',
  params: venueParams,
  response: adminVenueSchema,
});

export const adminDeleteVenueMedia = endpoint({
  method: 'DELETE',
  path: '/v1/admin/media/:mediaId',
  summary: 'Delete a venue photo',
  auth: 'admin',
  permission: 'venues.edit',
  params: z.object({ mediaId: uuidSchema }),
  response: adminVenueSchema,
});

// ---------------------------------------------------------------------------------------------
// Admin: cross-organization review queue (plan §3)
// ---------------------------------------------------------------------------------------------

export const adminPendingVenueSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: localizedSchema,
  status: venueStatusSchema,
  governorateId: uuidSchema,
  ownerName: z.string().nullable(),
  ownerPhone: z.string().nullable(),
  createdAt: z.string(),
});

export const adminListPendingVenues = endpoint({
  method: 'GET',
  path: '/v1/admin/venues',
  summary: 'Venues across every organization, filterable by status (review queue)',
  auth: 'admin',
  permission: 'venues.read',
  query: z.object({ status: venueStatusSchema.optional() }),
  response: z.object({ items: z.array(adminPendingVenueSchema) }),
});

// ---------------------------------------------------------------------------------------------
// Self-registration (plan §3): the signed-in user registers and manages their own venue.
// Authorization happens per venue inside the service (ADR-0008) — never admin-gated.
// ---------------------------------------------------------------------------------------------

export const registerVenueInputSchema = z.object({
  name: localizedTextSchema(120),
  description: localizedTextSchema(2000).optional(),
  governorateId: uuidSchema,
  areaId: uuidSchema.nullable().optional(),
  address: localizedTextSchema(300).optional(),
  location: locationInput.nullable().optional(),
  contactPhone: phoneInputSchema,
});

export const registerVenue = endpoint({
  method: 'POST',
  path: '/v1/manage/venues',
  summary: 'Register a new venue (creates its organization; the caller becomes owner)',
  auth: 'user',
  body: registerVenueInputSchema,
  response: adminVenueSchema,
});

export const getMyVenueProfile = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/profile',
  summary: 'Full profile (for the registration wizard / edit) of a venue the caller manages',
  auth: 'user',
  orgPermission: 'venue.read',
  params: venueParams,
  response: adminVenueSchema,
});

export const updateMyVenue = endpoint({
  method: 'PATCH',
  path: '/v1/manage/venues/:venueId',
  summary: 'Update the profile of a venue the caller manages',
  auth: 'user',
  orgPermission: 'venue.edit',
  params: venueParams,
  body: venueProfileInputSchema.omit({ slug: true }).partial(),
  response: adminVenueSchema,
});

export const submitMyVenue = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/submit',
  summary: 'Submit a draft (or fixed, previously rejected) venue for admin review',
  auth: 'user',
  orgPermission: 'venue.edit',
  params: venueParams,
  response: adminVenueSchema,
});

export const createMyFacility = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/facilities',
  summary: 'Add a facility to a venue the caller manages',
  auth: 'user',
  orgPermission: 'venue.edit',
  params: venueParams,
  body: z.object({ name: localizedTextSchema(120) }),
  response: adminVenueSchema,
});

export const createMyResource = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/resources',
  summary: 'Add a bookable resource (court/pitch) to a venue the caller manages',
  auth: 'user',
  orgPermission: 'venue.edit',
  params: venueParams,
  body: resourceInputSchema,
  response: adminVenueSchema,
});

export const updateMyResource = endpoint({
  method: 'PATCH',
  path: '/v1/manage/resources/:resourceId',
  summary: 'Update a resource of a venue the caller manages',
  auth: 'user',
  orgPermission: 'venue.edit',
  params: z.object({ resourceId: uuidSchema }),
  body: z.object({
    name: localizedTextSchema(120).optional(),
    facilityId: uuidSchema.nullable().optional(),
    sportFormatIds: z.array(uuidSchema).min(1).max(20).optional(),
    attributes: z.record(z.string(), z.union([z.string(), z.boolean()])).optional(),
    status: z.enum(['active', 'inactive', 'archived']).optional(),
  }),
  response: adminVenueSchema,
});

export const uploadMyVenueMedia = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/media',
  summary: 'Upload a photo (JPEG, PNG or WebP body) to a venue the caller manages',
  auth: 'user',
  orgPermission: 'venue.edit',
  params: venueParams,
  response: adminVenueSchema,
});

export const deleteMyVenueMedia = endpoint({
  method: 'DELETE',
  path: '/v1/manage/media/:mediaId',
  summary: 'Delete a photo of a venue the caller manages',
  auth: 'user',
  orgPermission: 'venue.edit',
  params: z.object({ mediaId: uuidSchema }),
  response: adminVenueSchema,
});
