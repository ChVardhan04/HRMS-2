'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { enqueueOfflineAction } from '@/lib/offline-queue';

export function useTodayWorkDay() {
  return useQuery({ queryKey: ['work-day', 'today'], queryFn: () => api.get<any>('/work-days/today') });
}

export function useTeamToday() {
  return useQuery({ queryKey: ['work-day', 'team-today'], queryFn: () => api.get<any[]>('/work-days/team-today') });
}

export function useCheckIn() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: { latitude?: number; longitude?: number } = {}) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        enqueueOfflineAction({ type: 'CHECK_IN', payload });
        throw new Error('OFFLINE_QUEUED');
      }
      return api.post('/attendance/check-in', payload);
    },
    onSuccess: () => {
      toast({ title: 'Checked in', description: 'Your WorkDay has started — today\'s to-dos are unlocked.', variant: 'success' });
      qc.invalidateQueries({ queryKey: ['work-day'] });
      qc.invalidateQueries({ queryKey: ['todos'] });
    },
    onError: (err: any) => {
      if (err.message === 'OFFLINE_QUEUED') {
        toast({ title: 'You\'re offline', description: 'Check-in queued and will sync automatically.', variant: 'default' });
      } else {
        toast({ title: 'Check-in failed', description: err.message, variant: 'destructive' });
      }
    },
  });
}

export function useCheckOut() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: { latitude?: number; longitude?: number } = {}) => api.post('/attendance/check-out', payload),
    onSuccess: () => {
      toast({ title: 'Checked out', description: 'Working hours recorded for today.', variant: 'success' });
      qc.invalidateQueries({ queryKey: ['work-day'] });
    },
    onError: (err: any) => toast({ title: 'Check-out failed', description: err.message, variant: 'destructive' }),
  });
}
