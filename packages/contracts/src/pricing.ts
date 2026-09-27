import { z } from 'zod';
import { endpoint } from './endpoint.js';
import { uuidSchema } from './common.js';
import { dateSchema, slotSchema, timeSchema } from './scheduling.js';

/** Money in integer minor units (JOD: fils). Display formatting is done by the client. */
export const moneySchema = z.object({ amount: z.number().int(), currency: z.string().length(3) });
export type MoneyValue = z.infer<typeof moneySchema>;

export const priceAmountSchema = z.object({
  durationMinutes: z.number().int().min(15).max(600),
  amount: z.number().int().min(0).max(100_000_000),
});

const bandFields = {
  /** ISO weekdays of the business date. */
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  /** Minutes from local midnight of the business date; values ≥ 1440 are after midnight. */
  startMinute: z.number().int().min(0).max(2879),
  endMinute: z.number().int().min(1).max(2880),
  dateFrom: dateSchema.nullable(),
  dateTo: dateSchema.nullable(),
  priority: z.number().int().min(-100).max(100),
  label: z.string().trim().max(80).nullable(),
};

export const priceRuleSchema = z.object({
  id: uuidSchema,
  resourceId: uuidSchema,
  currency: z.string(),
  amounts: z.array(priceAmountSchema),
  createdAt: z.string(),
  ...bandFields,
});
export type PriceRuleView = z.infer<typeof priceRuleSchema>;

export const venuePricingSchema = z.object({
  currency: z.string(),
  rules: z.array(priceRuleSchema),
});
export type VenuePricing = z.infer<typeof venuePricingSchema>;

const ruleInput = z
  .object({
    daysOfWeek: bandFields.daysOfWeek,
    startMinute: bandFields.startMinute,
    endMinute: bandFields.endMinute,
    dateFrom: dateSchema.nullable().default(null),
    dateTo: dateSchema.nullable().default(null),
    priority: bandFields.priority.default(0),
    label: z.string().trim().max(80).nullable().default(null),
    amounts: z.array(priceAmountSchema).min(1).max(8),
  })
  .refine(
    (r) => r.endMinute > r.startMinute && r.endMinute - r.startMinute <= 1440,
    'Invalid time band',
  )
  .refine(
    (r) =>
      (r.dateFrom === null) === (r.dateTo === null) &&
      (r.dateTo === null || r.dateTo >= r.dateFrom!),
    'Invalid dates',
  );

const venueParams = z.object({ venueId: uuidSchema });

export const getVenuePricing = endpoint({
  method: 'GET',
  path: '/v1/manage/venues/:venueId/pricing',
  summary: 'Active price rules of a venue',
  auth: 'user',
  params: venueParams,
  response: venuePricingSchema,
});

export const createPriceRules = endpoint({
  method: 'POST',
  path: '/v1/manage/venues/:venueId/pricing',
  summary: 'Create a price band for one or more resources',
  auth: 'user',
  params: venueParams,
  body: z.object({ resourceIds: z.array(uuidSchema).min(1).max(50), rule: ruleInput }),
  response: venuePricingSchema,
});

export const replacePriceRule = endpoint({
  method: 'PUT',
  path: '/v1/manage/price-rules/:ruleId',
  summary: 'Change a price band (the old rule is archived, a new one is created)',
  auth: 'user',
  params: z.object({ ruleId: uuidSchema }),
  body: z.object({ rule: ruleInput }),
  response: venuePricingSchema,
});

export const archivePriceRule = endpoint({
  method: 'DELETE',
  path: '/v1/manage/price-rules/:ruleId',
  summary: 'Remove a price band',
  auth: 'user',
  params: z.object({ ruleId: uuidSchema }),
  response: venuePricingSchema,
});

export const previewQuote = endpoint({
  method: 'GET',
  path: '/v1/manage/resources/:resourceId/quote',
  summary: 'What would this slot cost? (price preview)',
  auth: 'user',
  params: z.object({ resourceId: uuidSchema }),
  /** Business date and venue-local start time (times before the business-day start are after midnight). */
  query: z.object({
    date: dateSchema,
    startTime: timeSchema,
    durationMinutes: z.coerce.number().int().min(15).max(600),
  }),
  response: z.object({ price: moneySchema.nullable(), ruleId: uuidSchema.nullable() }),
});

// Public availability with prices ------------------------------------------------------------

export const pricedSlotSchema = slotSchema.extend({ price: moneySchema });
export type PricedSlot = z.infer<typeof pricedSlotSchema>;

export const pricedAvailabilitySchema = z.object({
  date: z.string(),
  timezone: z.string(),
  resources: z.array(z.object({ resourceId: uuidSchema, slots: z.array(pricedSlotSchema) })),
});
export type PricedAvailability = z.infer<typeof pricedAvailabilitySchema>;

export const getVenueAvailability = endpoint({
  method: 'GET',
  path: '/v1/venues/:slug/availability',
  summary: 'Bookable slots with prices for every active resource on a business date (venue-local)',
  auth: 'public',
  params: z.object({ slug: z.string().max(60) }),
  query: z.object({ date: dateSchema }),
  response: pricedAvailabilitySchema,
});
