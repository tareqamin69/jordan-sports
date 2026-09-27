'use client';

import { getAdminMe } from '@jordan-sports/contracts';
import { useQuery } from '@tanstack/react-query';
import { isApiError, useApi } from './api';

export function useAdminMe() {
  const api = useApi();
  return useQuery({
    queryKey: ['admin-me'],
    queryFn: async () => {
      try {
        return await api(getAdminMe);
      } catch (error) {
        if (isApiError(error, 'UNAUTHENTICATED')) return null;
        throw error;
      }
    },
  });
}
