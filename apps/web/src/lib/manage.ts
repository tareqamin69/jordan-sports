'use client';

import { getVenueSchedule, type VenueSchedule } from '@jordan-sports/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './api';

export function useVenueSchedule(venueId: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['schedule', venueId],
    queryFn: () => api(getVenueSchedule, { params: { venueId } }),
  });
}

export function useSetSchedule(venueId: string) {
  const queryClient = useQueryClient();
  return (schedule: VenueSchedule) => queryClient.setQueryData(['schedule', venueId], schedule);
}

export function can(schedule: VenueSchedule | undefined, permission: string): boolean {
  return schedule?.permissions.includes(permission) ?? false;
}
