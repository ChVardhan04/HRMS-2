'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiFetch } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function useTodayTodos() {
  return useQuery({ queryKey: ['todos', 'today'], queryFn: () => api.get<any[]>('/todos/today') });
}

export function useTodoEodStatus() {
  return useQuery({ queryKey: ['todos', 'eod-status'], queryFn: () => api.get<any>('/todos/eod-status') });
}

export function useCreateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title: string; priority?: string; dueDate?: string; estimatedHours?: number; assigneeId?: string }) => api.post('/todos', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  });
}

export function useResolveTodo() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, outcome, actualHours, outputSummary, incompleteReason, proof }: {
      id: string;
      outcome: 'COMPLETED' | 'INCOMPLETE';
      actualHours: number;
      outputSummary?: string;
      incompleteReason?: string;
      proof?: File;
    }) => {
      const form = new FormData();
      form.append('outcome', outcome);
      form.append('actualHours', String(actualHours));
      if (outputSummary) form.append('outputSummary', outputSummary);
      if (incompleteReason) form.append('incompleteReason', incompleteReason);
      if (proof) form.append('proof', proof);
      return apiFetch(`/todos/${id}/resolve`, { method: 'POST', body: form });
    },
    onSuccess: (_, variables) => {
      toast({ title: variables.outcome === 'COMPLETED' ? 'Task completed' : 'Task marked incomplete', description: 'Your EOD status and DPR have been updated.', variant: 'success' });
      qc.invalidateQueries({ queryKey: ['todos'] });
      qc.invalidateQueries({ queryKey: ['work-day'] });
      qc.invalidateQueries({ queryKey: ['dpr'] });
    },
    onError: (err: any) => toast({ title: 'Could not update task', description: err.message, variant: 'destructive' }),
  });
}

export async function getTodoProof(id: string) {
  return api.get<any>(`/todos/${id}/proof`);
}
