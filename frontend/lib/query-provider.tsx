'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/auth-store';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  useEffect(() => {
    // Persisted auth state must be restored after the first client render.
    // Otherwise role-based dashboards render differently on server and client
    // and Next.js reports a hydration mismatch.
    useAuthStore.persist.rehydrate();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
