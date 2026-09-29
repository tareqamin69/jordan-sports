import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { uuidSchema } from './common.js';

export const localizedSchema = z.object({ ar: z.string().optional(), en: z.string().optional() });

export const attributeFieldSchema = z.discriminatedUnion('type', [
  z.object({
    key: z.string(),
    type: z.literal('enum'),
    label: localizedSchema,
    options: z.array(z.object({ value: z.string(), label: localizedSchema })),
  }),
  z.object({ key: z.string(), type: z.literal('boolean'), label: localizedSchema }),
]);
export type AttributeField = z.infer<typeof attributeFieldSchema>;

/** Same shape as a venue photo (`Media`); kept here to keep the contracts module graph acyclic. */
const stockMediaSchema = z.object({
  id: z.string(),
  url: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  blur: z.string().nullable(),
  stock: z.object({ photographer: z.string(), sourceUrl: z.string() }).nullable().optional(),
});

export const sportFormatSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  name: localizedSchema,
  minPlayers: z.number().int(),
  maxPlayers: z.number().int(),
  defaultDurationMinutes: z.number().int(),
});

export const sportSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  name: localizedSchema,
  /** Icon key from the UI icon set (catalog data, so the UI never names a sport). */
  icon: z.string(),
  formats: z.array(sportFormatSchema),
  /** Illustrative photos of the sport (self-hosted stock); empty until they are downloaded. */
  photos: z.array(stockMediaSchema),
});
export type Sport = z.infer<typeof sportSchema>;

export const resourceTypeSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  name: localizedSchema,
  attributes: z.array(attributeFieldSchema),
  sportFormatIds: z.array(uuidSchema),
});
export type ResourceType = z.infer<typeof resourceTypeSchema>;

export const catalogSchema = z.object({
  sports: z.array(sportSchema),
  resourceTypes: z.array(resourceTypeSchema),
  amenities: z.array(z.object({ id: uuidSchema, key: z.string(), name: localizedSchema })),
  /** The 12 governorates of Jordan (table name is legacy: `catalog.cities`). */
  governorates: z.array(
    z.object({
      id: uuidSchema,
      key: z.string(),
      name: localizedSchema,
      timezone: z.string(),
      areas: z.array(z.object({ id: uuidSchema, key: z.string(), name: localizedSchema })),
    }),
  ),
  /** Sports with at least one active resource at an approved venue — what players should see. */
  offeredSportIds: z.array(uuidSchema),
  /** Live figures for the home page ("X ملعب · Y رياضة"). */
  counts: z.object({ venues: z.number().int(), sports: z.number().int() }),
  /** Platform switches the apps need to know about (server configuration). */
  features: z.object({
    /** CliQ-to-venue payments and the commission balance (ADR-0018); off while a card gateway is planned. */
    cliqPayments: z.boolean(),
  }),
  /** Platform support contact (owner settings); null when not set. */
  support: z.object({ whatsapp: z.string().nullable() }),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const getCatalog = endpoint({
  method: 'GET',
  path: '/v1/catalog',
  summary: 'Sports, formats, resource types, amenities and governorates',
  auth: 'public',
  response: catalogSchema,
});

// ---------------------------------------------------------------------------------------------
// Admin: geography (governorates and areas). Create, rename and reorder only — never delete, so a
// venue referencing an area is never orphaned.
// ---------------------------------------------------------------------------------------------

export const adminCreateGovernorate = endpoint({
  method: 'POST',
  path: '/v1/admin/geography/governorates',
  summary: 'Add a governorate',
  auth: 'admin',
  permission: 'catalog.manage',
  body: z.object({
    key: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(40),
    name: localizedSchema,
  }),
  response: catalogSchema,
});

export const adminUpdateGovernorate = endpoint({
  method: 'PATCH',
  path: '/v1/admin/geography/governorates/:governorateId',
  summary: 'Rename or reorder a governorate',
  auth: 'admin',
  permission: 'catalog.manage',
  params: z.object({ governorateId: uuidSchema }),
  body: z.object({ name: localizedSchema.optional(), sortOrder: z.number().int().optional() }),
  response: catalogSchema,
});

export const adminCreateArea = endpoint({
  method: 'POST',
  path: '/v1/admin/geography/governorates/:governorateId/areas',
  summary: 'Add an area to a governorate',
  auth: 'admin',
  permission: 'catalog.manage',
  params: z.object({ governorateId: uuidSchema }),
  body: z.object({
    key: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(40),
    name: localizedSchema,
  }),
  response: catalogSchema,
});

export const adminUpdateArea = endpoint({
  method: 'PATCH',
  path: '/v1/admin/geography/areas/:areaId',
  summary: 'Rename or reorder an area',
  auth: 'admin',
  permission: 'catalog.manage',
  params: z.object({ areaId: uuidSchema }),
  body: z.object({ name: localizedSchema.optional(), sortOrder: z.number().int().optional() }),
  response: catalogSchema,
});

// ---------------------------------------------------------------------------------------------
// Admin: sports. A sport is created with exactly one format and one resource type (both can be
// extended later directly in the database as the catalog grows); rename/re-icon afterwards.
// ---------------------------------------------------------------------------------------------

const keySchema = z
  .string()
  .regex(/^[a-z0-9_]+$/)
  .max(40);

export const adminCreateSport = endpoint({
  method: 'POST',
  path: '/v1/admin/sports',
  summary: 'Add a sport, its first format and its resource type',
  auth: 'admin',
  permission: 'catalog.manage',
  body: z.object({
    key: keySchema,
    name: localizedSchema,
    icon: z.string().max(60),
    format: z.object({
      key: keySchema,
      name: localizedSchema,
      minPlayers: z.number().int().min(1).max(60),
      maxPlayers: z.number().int().min(1).max(60),
      defaultDurationMinutes: z.number().int().min(15).max(600),
    }),
    resourceType: z.object({ key: keySchema, name: localizedSchema }),
  }),
  response: catalogSchema,
});

export const adminSportSchema = z.object({
  id: uuidSchema,
  key: z.string(),
  name: localizedSchema,
  icon: z.string(),
  /** Inactive sports are hidden from players; nothing is deleted. */
  active: z.boolean(),
  /** Approved venues that offer the sport. */
  venueCount: z.number().int(),
});
export type AdminSport = z.infer<typeof adminSportSchema>;

export const adminListSports = endpoint({
  method: 'GET',
  path: '/v1/admin/sports',
  summary: 'Every sport, active or hidden, with how many approved venues offer it',
  auth: 'admin',
  permission: 'catalog.manage',
  response: z.object({ items: z.array(adminSportSchema) }),
});

export const adminUpdateSport = endpoint({
  method: 'PATCH',
  path: '/v1/admin/sports/:sportId',
  summary: 'Rename, re-icon, hide or show a sport',
  auth: 'admin',
  permission: 'catalog.manage',
  params: z.object({ sportId: uuidSchema }),
  body: z.object({
    name: localizedSchema.optional(),
    icon: z.string().max(60).optional(),
    active: z.boolean().optional(),
  }),
  response: catalogSchema,
});

export const imageCreditsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      sport: z.string(),
      photographer: z.string(),
      photographerUrl: z.string(),
      sourceUrl: z.string(),
      license: z.string(),
      licenseUrl: z.string(),
    }),
  ),
});
export type ImageCredits = z.infer<typeof imageCreditsSchema>;

export const getImageCredits = endpoint({
  method: 'GET',
  path: '/v1/stock/credits',
  summary: 'Credits for the illustrative sport photos (Pexels)',
  auth: 'public',
  response: imageCreditsSchema,
});
