'use client';

import { getCatalog } from '@jordan-sports/contracts';
import { useQuery } from '@tanstack/react-query';
import { useApi } from './api';

export function useCatalog() {
  const api = useApi();
  return useQuery({ queryKey: ['catalog'], queryFn: () => api(getCatalog), staleTime: 5 * 60_000 });
}
