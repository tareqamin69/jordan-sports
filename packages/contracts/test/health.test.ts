import { describe, expect, it } from 'vitest';
import { livenessResponseSchema, readinessResponseSchema } from '../src/index.js';

describe('health contracts', () => {
  it('accepts a valid liveness response and rejects anything else', () => {
    expect(livenessResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(livenessResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  });

  it('accepts ready and not-ready readiness responses', () => {
    const ready = { status: 'ready', checks: { database: 'ok', migrations: 'ok' } };
    const notReady = { status: 'not_ready', checks: { database: 'ok', migrations: 'failed' } };
    expect(readinessResponseSchema.parse(ready)).toEqual(ready);
    expect(readinessResponseSchema.parse(notReady)).toEqual(notReady);
  });

  it('rejects unknown check values', () => {
    const invalid = { status: 'ready', checks: { database: 'maybe', migrations: 'ok' } };
    expect(readinessResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
