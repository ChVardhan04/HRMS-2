'use client';

import { Bell, LogOut, Menu, Settings, User, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/lib/auth-store';
import { api, clearTokens } from '@/lib/api-client';
import { initials } from '@/lib/utils';
import { useNotifications } from '@/features/notifications/use-notifications';
import { MobileNav } from './sidebar';

export function Topnav({ title }: { title: string }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: notifications } = useNotifications();
  const unread = notifications?.filter((n: any) => !n.readAt).length ?? 0;

  async function logout() {
    const { refreshToken } = api.getTokens();
    try { if (refreshToken) await api.post('/auth/logout', { refreshToken }); } catch {}
    clearTokens();
    setUser(null);
    router.replace('/login');
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></Button>
          <div><h1 className="text-base font-semibold tracking-tight">{title}</h1><p className="hidden text-[11px] text-muted-foreground sm:block">People, attendance and daily delivery</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative" onClick={() => router.push('/notifications')} aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-destructive" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className="flex items-center gap-2 rounded-full" aria-label="Account menu"><Avatar><AvatarFallback>{initials(user?.employee?.firstName, user?.employee?.lastName)}</AvatarFallback></Avatar></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/profile')}><User className="mr-2 h-4 w-4" /> Profile</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push('/settings')}><Settings className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={logout}><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[min(88vw,340px)] overflow-y-auto bg-background p-4 shadow-2xl">
            <div className="mb-5 flex items-center justify-between"><div><p className="font-semibold">HRMS</p><p className="text-xs text-muted-foreground">Navigation</p></div><Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}><X className="h-5 w-5" /></Button></div>
            <MobileNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
