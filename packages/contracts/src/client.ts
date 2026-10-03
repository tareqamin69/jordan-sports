// Runtime imports here must stay zod-free: this file ships to the browser via ./web.ts.
import type { ProblemDetails } from './common.js';
import { errorCodes } from './constants.js';
import type { Endpoint, EndpointInput, EndpointOutput } from './endpoint.js';

/** Same rule as `problemDetailsSchema`, without zod. */
function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === 'string' &&
    typeof v.title === 'string' &&
    typeof v.status === 'number' &&
    Number.isInteger(v.status) &&
    (errorCodes as readonly unknown[]).includes(v.code) &&
    (v.detail === undefined || typeof v.detail === 'string')
  );
}

export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(readonly problem: ProblemDetails) {
    super(problem.code);
  }
  get code() {
    return this.problem.code;
  }
  get status() {
    return this.problem.status;
  }
}

export function buildPath(path: string, params?: Record<string, unknown>): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null) throw new Error(`Missing path parameter ${name}`);
    return encodeURIComponent(String(value));
  });
}

export interface ApiClientOptions {
  /** e.g. `/api` in the browser (same-origin proxy) or `http://127.0.0.1:4000` on the server. */
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly headers?: Record<string, string>;
}

export type ApiClient = <E extends Endpoint>(
  endpoint: E,
  input?: EndpointInput<E>,
) => Promise<EndpointOutput<E>>;

/** Typed fetch wrapper. Throws ApiError with the problem details on non-2xx responses. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? fetch;
  return async (endpoint, input) => {
    const params = (input as { params?: Record<string, unknown> } | undefined)?.params;
    const query = (input as { query?: Record<string, unknown> } | undefined)?.query;
    const body = (input as { body?: unknown } | undefined)?.body;
    let url = options.baseUrl + buildPath(endpoint.path, params);
    if (query) {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
      }
      const qs = search.toString();
      if (qs) url += `?${qs}`;
    }
    const file = (input as { file?: Blob } | undefined)?.file;
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (file) headers['content-type'] = file.type || 'application/octet-stream';
    if (input?.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey;

    const response = await doFetch(url, {
      method: endpoint.method,
      headers,
      credentials: 'include',
      ...(body !== undefined ? { body: JSON.stringify(body) } : file ? { body: file } : {}),
    });
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ApiError(
        isProblemDetails(json)
          ? json
          : {
              type: 'about:blank',
              title: 'INTERNAL_ERROR',
              status: response.status,
              code: 'INTERNAL_ERROR',
            },
      );
    }
    // Full contracts (server side, tests) check the response; the browser's lightweight routes
    // (./web.ts) carry no schema, and the API already sends validated responses.
    const schema = (endpoint as Partial<Endpoint>).response;
    return (schema ? schema.parse(json) : json) as EndpointOutput<typeof endpoint>;
  };
}
