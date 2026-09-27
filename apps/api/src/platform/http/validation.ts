import type { z } from 'zod';
import { Errors } from './errors.js';

/** Parses untrusted input with a contract schema; failures become 400 VALIDATION_FAILED. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw Errors.validation(
      result.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
        message: i.message,
      })),
    );
  }
  return result.data;
}
