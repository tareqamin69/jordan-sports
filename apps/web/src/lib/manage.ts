'use client';

import {
  type OrgPermission,
  getVenueSchedule,
  listManagedVenues,
  type VenueSchedule,
} from '@jordan-sports/contracts/web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './api';

/** Every venue the signed-in user manages — shared by the venue picker and the venue switcher. */
export function useManagedVenues() {
  const api = useApi();
  return useQuery({ queryKey: ['managed-venues'], queryFn: () => api(listManagedVenues) });
}

export function useVenueSchedule(venueId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['schedule', venueId],
    queryFn: () => api(getVenueSchedule, { params: { venueId } }),
    enabled: venueId !== '',
  });
}

export function useSetSchedule(venueId: string) {
  const queryClient = useQueryClient();
  return (schedule: VenueSchedule) => queryClient.setQueryData(['schedule', venueId], schedule);
}

export function can(schedule: VenueSchedule | undefined, permission: OrgPermission): boolean {
  return schedule?.permissions.includes(permission) ?? false;
}
