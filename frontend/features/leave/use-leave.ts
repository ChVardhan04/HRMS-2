'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function useLeaveBalances() { return useQuery({ queryKey: ['leave','balances'], queryFn: () => api.get<any[]>('/leave/balances') }); }
export function useLeaveHistory() { return useQuery({ queryKey: ['leave','history'], queryFn: () => api.get<any[]>('/leave/history') }); }
export function useLeaveTypes() { return useQuery({ queryKey: ['leave','types'], queryFn: () => api.get<any[]>('/leave/types') }); }
export function useLeavePreview() {
  return useMutation({ mutationFn: (payload:any) => api.post<any>('/leave/preview', payload) });
}
export function useApplyLeave() {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: { data:any; medicalCertificate?: File | null }) => {
      const form = new FormData();
      Object.entries(payload.data).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') form.append(k, String(v)); });
      if (payload.medicalCertificate) form.append('medicalCertificate', payload.medicalCertificate);
      return api.postForm('/leave/apply', form);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave'] }); toast({ title: 'Leave requested', description: 'The request is now in the approval workflow.', variant: 'success' }); },
    onError: (e:any) => toast({ title: 'Could not apply', description: e.message, variant: 'destructive' }),
  });
}
export function useLeaveApprovals(enabled=true) { return useQuery({ queryKey:['leave','approvals'], queryFn:()=>api.get<any[]>('/leave/approvals'), enabled }); }
export function useApproveManagerLeave() { const qc=useQueryClient(); const {toast}=useToast(); return useMutation({mutationFn:(id:string)=>api.patch(`/leave/${id}/manager-approve`),onSuccess:()=>{qc.invalidateQueries({queryKey:['leave']});toast({title:'Manager approval recorded',description:'Sent to HR for final approval.',variant:'success'});},onError:(e:any)=>toast({title:'Approval failed',description:e.message,variant:'destructive'})}); }
export function useApproveHrLeave() { const qc=useQueryClient(); const {toast}=useToast(); return useMutation({mutationFn:(id:string)=>api.patch(`/leave/${id}/hr-approve`),onSuccess:()=>{qc.invalidateQueries({queryKey:['leave']});toast({title:'Leave fully approved',variant:'success'});},onError:(e:any)=>toast({title:'Approval failed',description:e.message,variant:'destructive'})}); }
export function useRejectLeave() { const qc=useQueryClient(); const {toast}=useToast(); return useMutation({mutationFn:({id,reason}:{id:string;reason:string})=>api.patch(`/leave/${id}/reject`,{reason}),onSuccess:()=>{qc.invalidateQueries({queryKey:['leave']});toast({title:'Leave rejected',variant:'success'});},onError:(e:any)=>toast({title:'Rejection failed',description:e.message,variant:'destructive'})}); }
export function useCancelLeave() { const qc=useQueryClient(); const {toast}=useToast(); return useMutation({mutationFn:(id:string)=>api.patch(`/leave/${id}/cancel`),onSuccess:()=>{qc.invalidateQueries({queryKey:['leave']});toast({title:'Leave request cancelled',variant:'success'});},onError:(e:any)=>toast({title:'Could not cancel leave',description:e.message,variant:'destructive'})}); }
export function useHrLeaveOverview(year:number,month:number,enabled=true,departmentId='') { return useQuery({queryKey:['leave','admin-overview',year,month,departmentId],queryFn:()=>api.get<any>(`/leave/admin/overview?year=${year}&month=${month}${departmentId?`&departmentId=${departmentId}`:''}`),enabled}); }
export function useSetLeaveBalance() { const qc=useQueryClient(); const {toast}=useToast(); return useMutation({mutationFn:({employeeId,leaveTypeId,year,accrued,carriedForward}:{employeeId:string;leaveTypeId:string;year:number;accrued:number;carriedForward?:number})=>api.patch(`/leave/admin/balances/${employeeId}/${leaveTypeId}?year=${year}`,{accrued,carriedForward}),onSuccess:()=>{qc.invalidateQueries({queryKey:['leave']});toast({title:'Leave balance updated',variant:'success'});},onError:(e:any)=>toast({title:'Could not update balance',description:e.message,variant:'destructive'})}); }
