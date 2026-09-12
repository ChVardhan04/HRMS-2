'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function useEmployees(search: string, pageSize = 50, page = 1, includeExited = false) {
  return useQuery({
    queryKey: ['employees', search, pageSize, page, includeExited],
    queryFn: () => api.get<any>(`/employees?search=${encodeURIComponent(search)}&pageSize=${pageSize}&page=${page}&includeExited=${includeExited}`),
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ['employees', id],
    queryFn: () => api.get<any>(`/employees/${id}`),
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: any) => api.post('/employees', payload),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({
        title: 'Employee created',
        description: data?.account?.activationUrl ? `Activation email was queued. Local activation link: ${data.account.activationUrl}` : 'The employee account was created and an activation email was sent.',
        variant: 'success',
      });
    },
    onError: (err: any) => toast({ title: 'Could not create employee', description: err.message, variant: 'destructive' }),
  });
}

export function useResendEmployeeActivation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (employeeId: string) => api.post(`/employees/${employeeId}/resend-activation`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'Activation email sent', description: 'A new activation link has been generated.', variant: 'success' });
    },
    onError: (err: any) => toast({ title: 'Could not resend activation', description: err.message, variant: 'destructive' }),
  });
}

export function useUpdateEmployee(id: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (payload: any) => api.patch(`/employees/${id}`, payload),
    onSuccess: (data: any) => {
      qc.setQueryData(['employees', id], data);
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'Employee updated', description: 'Employee master details were saved.', variant: 'success' });
    },
    onError: (err: any) => toast({ title: 'Could not update employee', description: err.message, variant: 'destructive' }),
  });
}

function employeeActionHook(id: string, action: 'deactivate' | 'reactivate' | 'delete') {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => action === 'delete' ? api.delete(`/employees/${id}`) : api.patch(`/employees/${id}/${action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.removeQueries({ queryKey: ['employees', id] });
      const labels = { deactivate: 'Employee deactivated', reactivate: 'Employee reactivated', delete: 'Employee deleted' };
      toast({ title: labels[action], variant: 'success' });
    },
    onError: (err: any) => toast({ title: `Could not ${action} employee`, description: err.message, variant: 'destructive' }),
  });
}

export function useDeactivateEmployee(id: string) { return employeeActionHook(id, 'deactivate'); }
export function useReactivateEmployee(id: string) { return employeeActionHook(id, 'reactivate'); }
export function useDeleteEmployee(id: string) { return employeeActionHook(id, 'delete'); }

export function useEmployeeDeletionInfo(id: string, enabled = true) {
  return useQuery({
    queryKey: ['employees', id, 'deletion-info'],
    queryFn: () => api.get<any>(`/employees/${id}/deletion-info`),
    enabled: Boolean(id) && enabled,
  });
}

export function useDepartments() {
  return useQuery({ queryKey: ['departments'], queryFn: () => api.get<any[]>('/departments') });
}
