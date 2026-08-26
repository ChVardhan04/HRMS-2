'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function useMyKraScores() {
  return useQuery({ queryKey: ['kra', 'me'], queryFn: () => api.get<any[]>('/kra/me') });
}

export function useTeamKraScores(month?: number, year?: number, enabled = true) {
  return useQuery({
    queryKey: ['kra', 'team', month, year],
    queryFn: () => api.get<any[]>(`/kra/team?month=${month ?? ''}&year=${year ?? ''}`),
    enabled,
  });
}

export function useStrikeDashboard() {
  return useQuery({ queryKey: ['strikes', 'dashboard'], queryFn: () => api.get<any[]>('/strikes/dashboard') });
}

export function useMyStrikes() {
  return useQuery({ queryKey: ['strikes', 'me'], queryFn: () => api.get<any[]>('/strikes/me') });
}
