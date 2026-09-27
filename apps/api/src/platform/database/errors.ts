/** PostgreSQL SQLSTATE codes the application reacts to. */
export const PgError = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  exclusionViolation: '23P01',
  serializationFailure: '40001',
  deadlockDetected: '40P01',
} as const;

export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

export function pgConstraint(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'constraint' in error) {
    const c = (error as { constraint: unknown }).constraint;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}
