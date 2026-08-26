'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<any[]>('/notifications'),
    refetchInterval: 60_000,
  });
}
