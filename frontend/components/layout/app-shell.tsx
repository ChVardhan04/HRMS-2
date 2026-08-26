'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Topnav } from './topnav';
import { normalizeRoles, useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api-client';

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const markHydrated = useAuthStore((s) => s.markHydrated);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

useEffect(() => {
  useAuthStore.persist.rehydrate();
  markHydrated();
}, [markHydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      const { accessToken } = api.getTokens();
      if (!accessToken) {
        router.replace('/login');
        return;
      }
      // We have a token but no cached user (e.g. hard refresh) - fetch the profile.
      api
        .get<any>('/users/me')
        .then((me) =>
          setUser({
            id: me.id,
            email: me.email,
            roles: normalizeRoles(me.roles ?? []),
            employee: me.employee,
          }),
        )
        .catch(() => router.replace('/login'));
    }
  }, [hydrated, user, router, setUser]);

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topnav title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
