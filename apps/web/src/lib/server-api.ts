import 'server-only';
import { ApiError, createApiClient } from '@jordan-sports/contracts';

/** Server-side API client (public endpoints) used by server components. */
export const serverApi = createApiClient({
  baseUrl: process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000',
});

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** Absolute site URL for canonical links, sitemaps and share links. */
export const siteUrl = (process.env.WEB_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
