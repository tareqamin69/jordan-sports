'use client';

import { getAdminMe, type PlatformPermission } from '@jordan-sports/contracts/web';
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

/** Whether the signed-in staff member has a permission (the API enforces it; this only hides UI). */
export function useCan(): (permission: PlatformPermission) => boolean {
  const me = useAdminMe();
  const permissions = me.data?.permissions ?? [];
  return (permission) => permissions.includes(permission);
}
