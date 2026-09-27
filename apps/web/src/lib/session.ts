'use client';

import { getMe } from '@jordan-sports/contracts';
import { useQuery } from '@tanstack/react-query';
import { isApiError, useApi } from './api';

/** The signed-in user, or null when signed out. */
export function useMe() {
  const api = useApi();
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api(getMe);
      } catch (error) {
        if (isApiError(error, 'UNAUTHENTICATED')) return null;
        throw error;
      }
    },
    staleTime: 30_000,
  });
}
