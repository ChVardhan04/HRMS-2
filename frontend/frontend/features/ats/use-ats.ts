'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

const STAGES = ['SOURCED', 'APPLIED', 'RESUME_SCREEN', 'HR_SCREEN', 'TECHNICAL_ROUND', 'MANAGER_ROUND', 'OFFER', 'JOINED'];

export { STAGES };

export function useCandidates() {
  return useQuery({ queryKey: ['candidates'], queryFn: () => api.get<any>('/candidates?pageSize=100') });
}

export function useMoveStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.patch(`/candidates/${id}/stage`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  });
}
