import { z } from 'zod';

import { errorCodes } from './constants.js';

export { errorCodes, type ErrorCode } from './constants.js';

/** RFC 9457 problem details as returned by the API. */
export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.enum(errorCodes),
    detail: z.string().optional(),
  })
  .passthrough();
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const localeSchema = z.enum(['ar', 'en']);

const text = (max: number) => z.string().trim().min(1).max(max);

/** Translated text `{ ar?, en? }` with at least one language. */
export const localizedTextSchema = (max = 200) =>
  z
    .object({ ar: text(max).optional(), en: text(max).optional() })
    .refine((v) => v.ar !== undefined || v.en !== undefined, {
      message: 'At least one language is required',
    });
export type LocalizedText = { ar?: string; en?: string };

export const uuidSchema = z.string().uuid();
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const okSchema = z.object({ ok: z.literal(true) });

export const pageQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const reasonSchemaBase = z.object({ reason: z.string().trim().min(3).max(500) });
