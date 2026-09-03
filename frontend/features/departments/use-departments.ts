'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api.get<any[]>('/departments') });
}

export function useDepartment(id?: string, month?: number, year?: number) {
  return useQuery({
    queryKey: ['departments', id, month, year],
    queryFn: () => api.get<any>(`/departments/${id}?month=${month ?? ''}&year=${year ?? ''}`),
    enabled: Boolean(id),
  });
}

function mutationToast(success: string, failure: string) {
  const qc = useQueryClient(); const { toast } = useToast();
  return { qc, toast, success, failure };
}

export function useCreateDepartment() {
  const { qc, toast } = mutationToast('Department created', 'Could not create department');
  return useMutation({ mutationFn: (name: string) => api.post('/departments', { name }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); toast({ title: 'Department created', variant: 'success' }); }, onError: (e:any) => toast({ title: 'Could not create department', description: e.message, variant: 'destructive' }) });
}

export function useUpdateDepartmentPolicy(id?: string) {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: (payload: any) => api.patch(`/departments/${id}/policy`, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); toast({ title: 'Department policy saved', description: 'Attendance, working-day and leave rules are now effective.', variant: 'success' }); }, onError: (e:any) => toast({ title: 'Could not save policy', description: e.message, variant: 'destructive' }) });
}

export function useUpdateDepartmentLeavePolicy(id?: string) {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({ mutationFn: (payload: any) => api.patch(`/departments/${id}/leave-policy`, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['leave'] }); toast({ title: 'Leave policy saved', variant: 'success' }); }, onError: (e:any) => toast({ title: 'Could not save leave policy', description: e.message, variant: 'destructive' }) });
}

export function useCreateDesignation() {
  const qc = useQueryClient(); const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: { title: string; departmentId: string }) => api.post('/departments/designations', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); toast({ title: 'Designation created', description: 'It is now available for employees in this department.', variant: 'success' }); },
    onError: (e:any) => toast({ title: 'Could not create designation', description: e.message, variant: 'destructive' }),
  });
}
