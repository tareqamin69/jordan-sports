import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type EndpointAuth = 'public' | 'user' | 'admin';

/**
 * One API operation, defined once and shared by the API (validation), clients (typed calls) and
 * the OpenAPI document (ADR-0010).
 */
export interface Endpoint {
  readonly method: HttpMethod;
  /** Path with `:param` placeholders. */
  readonly path: string;
  readonly summary: string;
  readonly auth: EndpointAuth;
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  readonly response: z.ZodType;
  /** Requires an `Idempotency-Key` header. */
  readonly idempotent?: boolean;
}

export function endpoint<const E extends Endpoint>(definition: E): E {
  return definition;
}

type Field<E, K extends 'params' | 'query' | 'body'> = E extends {
  [P in K]: infer S extends z.ZodType;
}
  ? { [P in K]: z.input<S> }
  : { [P in K]?: never };

export type EndpointInput<E extends Endpoint> = Field<E, 'params'> &
  Field<E, 'query'> &
  Field<E, 'body'> & { idempotencyKey?: string };

export type EndpointOutput<E extends Endpoint> = z.output<E['response']>;
