/**
 * Plain values shared by the API and the apps, with no runtime dependencies (no zod), so the
 * browser bundle can import them through `@jordan-sports/contracts/web` (see web.ts).
 */

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
  'ACCOUNT_LOCKED',
  'REAUTH_REQUIRED',
  'SETUP_LINK_INVALID',
  'IP_NOT_ALLOWED',
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
  // card payments / refunds / payouts (ADR-0020)
  'PAYMENT_REQUIRED',
  'PAYMENT_GATEWAY_UNAVAILABLE',
  'REFUND_NOT_RETRYABLE',
  'INVALID_IBAN',
  'PAYOUT_ACCOUNT_MISSING',
  'PAYOUT_AMOUNT_CHANGED',
  'NOTHING_TO_PAY_OUT',
  'ACCOUNT_HAS_UPCOMING_BOOKINGS',
  'ACCOUNT_RUNS_VENUE',
  // import from a map link
  'MAP_LINK_UNREADABLE',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

/** Photo URLs accept `?w=` with one of these widths (smaller WebP copies, created once). */
export const mediaWidths = [320, 640, 960, 1600] as const;

/** Private venue rating tags (admin oversight). */
export const venueRatingTags = [
  'reliable',
  'slow_to_reply',
  'complaints',
  'cancels_often',
  'great_facilities',
  'pricing_issues',
  'recommended',
] as const;

/**
 * Version of the published legal texts (terms, privacy, refunds, cookies). Recorded with every
 * sign-up consent; bump it whenever those texts change (docs/legal/README.md).
 */
export const LEGAL_TEXTS_VERSION = '2026-10-03';
