import { z } from 'zod';

/** `GET /healthz` — liveness: the process is up and serving HTTP. No dependencies checked. */
export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

export const readinessCheckStatusSchema = z.enum(['ok', 'failed']);

/**
 * `GET /readyz` — readiness: the database is reachable and every migration shipped with this
 * build has been applied. Responds 200 when `status` is `ready`, otherwise 503.
 * Deliberately exposes no versions, hostnames or error details.
 */
export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({
    database: readinessCheckStatusSchema,
    migrations: readinessCheckStatusSchema,
  }),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
