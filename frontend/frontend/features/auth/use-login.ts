'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    roles: string[];
    employee: any;
    mustChangePassword: boolean;
  };
}

export function useLogin() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.post<LoginResponse>('/auth/login', input, { skipAuth: true }),
    onSuccess: (data) => {
      api.setTokens(data.accessToken, data.refreshToken);
      setUser({ id: data.user.id, email: data.user.email, roles: data.user.roles, employee: data.user.employee });
      toast({ title: 'Welcome back', description: `Signed in as ${data.user.email}`, variant: 'success' });
      router.push('/dashboard');
    },
    onError: (err: any) => {
      toast({ title: 'Login failed', description: err.message ?? 'Invalid credentials', variant: 'destructive' });
    },
  });
}
