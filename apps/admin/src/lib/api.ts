'use client';

import { ApiError, createApiClient, type ApiClient } from '@jordan-sports/contracts/web';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { requestReauth } from './reauth';

/** Typed API client without the re-authentication retry (used by the prompt itself). */
export function useRawApi(): ApiClient {
  const locale = useLocale();
  return useMemo(
    () => createApiClient({ baseUrl: '/api', headers: { 'accept-language': locale } }),
    [locale],
  );
}

/**
 * Typed API client for client components, via the same-origin `/api` proxy. Dangerous actions
 * answered with REAUTH_REQUIRED are retried once after the staff member confirms their identity.
 */
export function useApi(): ApiClient {
  const raw = useRawApi();
  return useMemo<ApiClient>(
    () =>
      (async (endpoint, input) => {
        try {
          return await raw(endpoint, input);
        } catch (error) {
          if (!isApiError(error, 'REAUTH_REQUIRED') || !(await requestReauth())) throw error;
          return raw(endpoint, input);
        }
      }) as ApiClient,
    [raw],
  );
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
