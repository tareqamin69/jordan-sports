import { z } from 'zod';

export const errorCodes = [
  // generic
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'ORIGIN_NOT_ALLOWED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
  // identity
  'INVALID_PHONE',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_TOO_MANY_ATTEMPTS',
  'SIGNUP_TOKEN_INVALID',
  'INVALID_CREDENTIALS',
  'ACCOUNT_SUSPENDED',
  // tenancy / catalog / venues
  'SLUG_TAKEN',
  'ALREADY_MEMBER',
  'LAST_OWNER',
  'INVALID_ATTRIBUTES',
  'INVALID_STATE_TRANSITION',
  'UNSUPPORTED_MEDIA',
  // scheduling / pricing / bookings
  'SLOT_UNAVAILABLE',
  'SLOT_NOT_BOOKABLE',
  'SCHEDULE_CONFLICT',
  'HOLD_EXPIRED',
  'HOLD_LIMIT_REACHED',
  'NO_PRICE',
  'IDEMPOTENCY_KEY_REUSED',
  'REQUEST_IN_PROGRESS',
  'IDEMPOTENCY_KEY_REQUIRED',
  'CANCELLATION_NOT_ALLOWED',
  // payments / balance
  'PAYMENT_REQUIRED',
  'PAYMENT_REFERENCE_USED',
  'PAYMENT_NOT_PENDING',
  'PAYMENT_AWAITING_VENUE',
  'REFUND_NOT_DUE',
  'VENUE_NOT_ACCEPTING_BOOKINGS',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

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
