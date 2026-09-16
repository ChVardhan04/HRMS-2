'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function useDpr(workDayId?: string) {
  return useQuery({
    queryKey: ['dpr', workDayId],
    queryFn: () => api.get<any>(`/dpr/work-day/${workDayId}`),
    enabled: !!workDayId,
  });
}

export function usePendingReviews() {
  return useQuery({ queryKey: ['dpr', 'pending-review'], queryFn: () => api.get<any[]>('/dpr/pending-review') });
}


export function useSaveDprDraft() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ workDayId, entries }: { workDayId: string; entries: any[] }) =>
      api.patch(`/dpr/work-day/${workDayId}/draft`, { entries }),
    onSuccess: (_data, variables) => {
      toast({ title: 'DPR draft saved', variant: 'success' });
      qc.invalidateQueries({ queryKey: ['dpr', variables.workDayId] });
      qc.invalidateQueries({ queryKey: ['dpr'] });
      qc.invalidateQueries({ queryKey: ['work-day'] });
    },
    onError: (err: any) =>
      toast({ title: 'Could not save DPR', description: err.message, variant: 'destructive' }),
  });
}

export function useTeamDprStatus(enabled = true) {
  return useQuery({
    queryKey: ['dpr', 'team-status'],
    queryFn: () => api.get<any[]>('/dpr/team-status'),
    enabled,
    refetchInterval: 60000,
  });
}

export function useSubmitDpr() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (workDayId: string) => api.post(`/dpr/work-day/${workDayId}/submit`),
    onSuccess: () => {
      toast({ title: 'DPR submitted', description: 'Your manager has been notified.', variant: 'success' });
      qc.invalidateQueries({ queryKey: ['dpr'] });
      qc.invalidateQueries({ queryKey: ['work-day'] });
    },
    onError: (err: any) => toast({ title: 'Submit failed', description: err.message, variant: 'destructive' }),
  });
}

export function useReviewDpr() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ dprId, decision, comment, qualityScore }: { dprId: string; decision: 'approve' | 'reject' | 'request-changes'; comment?: string; qualityScore?: number }) =>
      api.patch(`/dpr/${dprId}/${decision}`, { comment, qualityScore }),
    onSuccess: () => {
      toast({ title: 'Review recorded', variant: 'success' });
      qc.invalidateQueries({ queryKey: ['dpr'] });
    },
    onError: (err: any) => toast({ title: 'Review failed', description: err.message, variant: 'destructive' }),
  });
}
