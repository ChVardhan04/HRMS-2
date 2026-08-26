'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function useLeaveBalances() {
  return useQuery({ queryKey: ['leave', 'balances'], queryFn: () => api.get<any[]>('/leave/balances') });
}

export function useLeaveHistory() {
  return useQuery({ queryKey: ['leave', 'history'], queryFn: () => api.get<any[]>('/leave/history') });
}

export function useLeaveTypes() {
  return useQuery({ queryKey: ['leave', 'types'], queryFn: () => api.get<any[]>('/leave/types') });
}

export function useApplyLeave() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: { leaveTypeId: string; startDate: string; endDate: string; reason?: string }) =>
      api.post('/leave/apply', payload),
    onSuccess: () => {
      toast({ title: 'Leave requested', description: 'Your manager has been notified.', variant: 'success' });
      qc.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (err: any) => toast({ title: 'Could not apply', description: err.message, variant: 'destructive' }),
  });
}

export function useLeaveApprovals(enabled = true) {
  return useQuery({ queryKey: ['leave', 'approvals'], queryFn: () => api.get<any[]>('/leave/approvals'), enabled });
}

export function useApproveManagerLeave() {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: (id: string) => api.patch(`/leave/${id}/manager-approve`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave'] }); toast({ title: 'Leave approved', description: 'Sent to HR for final approval.', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Approval failed', description: e.message, variant: 'destructive' }) });
}

export function useApproveHrLeave() {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: (id: string) => api.patch(`/leave/${id}/hr-approve`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave'] }); toast({ title: 'Leave fully approved', description: 'Attendance will be marked as leave for the approved dates.', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Approval failed', description: e.message, variant: 'destructive' }) });
}

export function useRejectLeave() {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.patch(`/leave/${id}/reject`, { reason }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave'] }); toast({ title: 'Leave rejected', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Rejection failed', description: e.message, variant: 'destructive' }) });
}

export function useCancelLeave() {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: (id: string) => api.patch(`/leave/${id}/cancel`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave'] }); toast({ title: 'Leave request cancelled', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Could not cancel leave', description: e.message, variant: 'destructive' }) });
}
