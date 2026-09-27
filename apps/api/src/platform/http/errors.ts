import type { ErrorCode } from '@jordan-sports/contracts';

/**
 * An expected, client-facing error. Rendered as RFC 9457 problem details with a stable `code`
 * that clients translate (docs/architecture.md §N). Never put secrets or personal data in
 * `detail`.
 */
export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly detail?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(detail ?? code);
  }
}

export const Errors = {
  validation: (issues: unknown) =>
    new AppError('VALIDATION_FAILED', 400, 'Request validation failed', { issues }),
  unauthenticated: () => new AppError('UNAUTHENTICATED', 401),
  forbidden: () => new AppError('FORBIDDEN', 403),
  notFound: () => new AppError('NOT_FOUND', 404),
  conflict: (code: ErrorCode, detail?: string) => new AppError(code, 409, detail),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError('RATE_LIMITED', 429, undefined, { retryAfterSeconds }),
};
