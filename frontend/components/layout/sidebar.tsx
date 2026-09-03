'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Clock, ListChecks, FileText, CalendarDays, Settings2, BarChart3,
  BriefcaseBusiness, MessagesSquare, Target, ShieldAlert, FolderLock, UserCircle2, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/attendance', label: 'Attendance', icon: Clock },
  { href: '/todos', label: 'To-Dos', icon: ListChecks },
  { href: '/dpr', label: 'DPR', icon: FileText },
  { href: '/leave', label: 'Leave', icon: CalendarDays },
  { href: '/employees', label: 'Employees', icon: Users, roles: ['HR_ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
  { href: '/departments', label: 'Departments', icon: Building2, roles: ['HR_ADMIN', 'SUPER_ADMIN'] },
  { href: '/calendar', label: 'Company Calendar', icon: CalendarDays },
  { href: '/policies', label: 'Policies', icon: FileText },
  { href: '/documents', label: 'Documents', icon: FolderLock },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['HR_ADMIN', 'LEADERSHIP', 'SUPER_ADMIN'] },
  { href: '/kra', label: 'KRA', icon: Target, roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'SUPER_ADMIN'] },
  { href: '/strikes', label: '3-Strike', icon: ShieldAlert, roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'SUPER_ADMIN'] },
  { href: '/ats', label: 'ATS', icon: BriefcaseBusiness, roles: ['HR_ADMIN', 'SUPER_ADMIN'] },
  { href: '/group-monitor', label: 'Group Monitor', icon: MessagesSquare, roles: ['HR_ADMIN', 'SUPER_ADMIN'] },
  { href: '/profile', label: 'My Profile', icon: UserCircle2 },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

function filteredItems(hasRole: (...roles: string[]) => boolean) {
  return NAV_ITEMS.filter((item) => !item.roles || hasRole(...item.roles));
}

export function Sidebar() {
  const pathname = usePathname();
  const hasRole = useAuthStore((s) => s.hasRole);
  const user = useAuthStore((s) => s.user);
  const items = filteredItems(hasRole);

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <BriefcaseBusiness className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <span className="block text-sm font-semibold tracking-tight text-white">HRMS</span>
          <span className="block text-[10px] uppercase tracking-widest text-sidebar-foreground/50">People OS</span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4 scrollbar-thin">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-white/10 text-white' : 'text-sidebar-foreground/70 hover:bg-white/5 hover:text-white',
            )}>
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="truncate text-xs text-sidebar-foreground/50">
          {user?.employee?.department?.name ?? 'Organization'} · {user?.employee?.designation?.title ?? 'Employee'}
        </p>
      </div>
    </aside>
  );
}

export function MobileNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const hasRole = useAuthStore((s) => s.hasRole);
  const items = filteredItems(hasRole);
  return (
    <nav className="grid gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium',
            active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}>
            <Icon className="h-4 w-4" />{item.label}
          </Link>
        );
      })}
    </nav>
  );
}
