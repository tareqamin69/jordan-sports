'use client';

import { ApiError, createApiClient, type ApiClient } from '@jordan-sports/contracts/web';
import { useLocale } from 'next-intl';
import { useMemo } from 'react';

/** Typed API client for client components, via the same-origin `/api` proxy. */
export function useApi(): ApiClient {
  const locale = useLocale();
  return useMemo(
    () => createApiClient({ baseUrl: '/api', headers: { 'accept-language': locale } }),
    [locale],
  );
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
