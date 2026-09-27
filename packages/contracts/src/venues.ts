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

export const venueSummarySchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: localizedSchema,
  city: namedRef,
  area: namedRef.nullable(),
  sports: z.array(namedRef),
  cover: mediaSchema.nullable(),
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
  summary: 'Approved venues, filterable by sport, city and area',
  auth: 'public',
  query: pageQuerySchema.extend({
    sport: z.string().max(40).optional(),
    city: z.string().max(40).optional(),
    area: z.string().max(40).optional(),
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
  cityId: uuidSchema,
  areaId: uuidSchema.nullable().optional(),
  address: localizedTextSchema(300).optional(),
  location: locationInput.nullable().optional(),
  contactPhone: phoneInputSchema.nullable().optional(),
  amenityIds: z.array(uuidSchema).max(50).default([]),
  businessDayStartMinute: z.number().int().min(0).max(720).optional(),
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
  timezone: z.string(),
  currency: z.string(),
  cityId: uuidSchema,
  areaId: uuidSchema.nullable(),
  address: localizedSchema,
  location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  contactPhone: z.string().nullable(),
  businessDayStartMinute: z.number().int(),
  amenityIds: z.array(uuidSchema),
  facilities: z.array(z.object({ id: uuidSchema, name: localizedSchema })),
  resources: z.array(adminResourceSchema),
  media: z.array(mediaSchema),
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
  params: z.object({ organizationId: uuidSchema }),
  response: z.object({ items: z.array(adminVenueListItemSchema) }),
});

export const adminCreateVenue = endpoint({
  method: 'POST',
  path: '/v1/admin/organizations/:organizationId/venues',
  summary: 'Create a venue (draft)',
  auth: 'admin',
  params: z.object({ organizationId: uuidSchema }),
  body: venueProfileInputSchema,
  response: adminVenueSchema,
});

export const adminGetVenue = endpoint({
  method: 'GET',
  path: '/v1/admin/venues/:venueId',
  summary: 'Venue with facilities, resources and media',
  auth: 'admin',
  params: venueParams,
  response: adminVenueSchema,
});

export const adminUpdateVenue = endpoint({
  method: 'PATCH',
  path: '/v1/admin/venues/:venueId',
  summary: 'Update the venue profile',
  auth: 'admin',
  params: venueParams,
  body: venueProfileInputSchema.partial(),
  response: adminVenueSchema,
});

export const adminSetVenueStatus = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/status',
  summary: 'Approve, reject, suspend or reopen a venue (audited)',
  auth: 'admin',
  params: venueParams,
  body: reasonSchemaBase.extend({ status: venueStatusSchema }),
  response: adminVenueSchema,
});

export const adminCreateFacility = endpoint({
  method: 'POST',
  path: '/v1/admin/venues/:venueId/facilities',
  summary: 'Add a facility (a group of resources)',
  auth: 'admin',
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
  params: venueParams,
  body: resourceInputSchema,
  response: adminVenueSchema,
});

export const adminUpdateResource = endpoint({
  method: 'PATCH',
  path: '/v1/admin/resources/:resourceId',
  summary: 'Update a resource',
  auth: 'admin',
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
  params: venueParams,
  response: adminVenueSchema,
});

export const adminDeleteVenueMedia = endpoint({
  method: 'DELETE',
  path: '/v1/admin/media/:mediaId',
  summary: 'Delete a venue photo',
  auth: 'admin',
  params: z.object({ mediaId: uuidSchema }),
  response: adminVenueSchema,
});
