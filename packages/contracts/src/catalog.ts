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
  formats: z.array(sportFormatSchema),
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
  cities: z.array(
    z.object({
      id: uuidSchema,
      key: z.string(),
      name: localizedSchema,
      timezone: z.string(),
      areas: z.array(z.object({ id: uuidSchema, key: z.string(), name: localizedSchema })),
    }),
  ),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const getCatalog = endpoint({
  method: 'GET',
  path: '/v1/catalog',
  summary: 'Sports, formats, resource types, amenities and cities',
  auth: 'public',
  response: catalogSchema,
});
