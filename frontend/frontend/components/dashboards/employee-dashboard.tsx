'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, FileText, Sparkles } from 'lucide-react';
import { api } from '@/lib/api-client';
import { CheckInWidget } from '@/components/attendance/check-in-widget';
import { TodayTodoList } from '@/components/todos/today-todo-list';
import { TodayDprCard } from '@/components/dpr/today-dpr-card';
import { LeaveBalanceCard } from '@/components/leave/leave-balance-card';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';

export function EmployeeDashboard() {
  const employee = useAuthStore((s) => s.user?.employee);
  const { data: holidays } = useQuery({ queryKey: ['calendar', 'holidays', new Date().getFullYear()], queryFn: () => api.get<any[]>(`/calendar/holidays?year=${new Date().getFullYear()}`) });
  const upcoming = holidays?.find((h: any) => new Date(h.date) >= new Date());
  return <div className="space-y-4">
    <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-background to-background p-5 ring-1 ring-primary/10"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Sparkles className="h-5 w-5" /></div><div><h2 className="text-xl font-semibold">Good morning, {employee?.firstName ?? 'there'}.</h2><p className="mt-1 text-sm text-muted-foreground">Here’s what needs your attention today.</p></div></div></div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><CheckInWidget /><LeaveBalanceCard /><TodayTodoList /><TodayDprCard /></div>
    <div className="grid gap-4 md:grid-cols-2"><Card><CardContent className="flex items-center gap-3 p-4"><CalendarDays className="h-5 w-5 text-primary" /><div><p className="text-sm font-medium">Next company holiday</p><p className="text-xs text-muted-foreground">{upcoming ? `${upcoming.name} · ${new Date(upcoming.date).toLocaleDateString()}` : 'No upcoming holiday in the current year.'}</p></div></CardContent></Card><Card><CardContent className="flex items-center gap-3 p-4"><FileText className="h-5 w-5 text-primary" /><div><p className="text-sm font-medium">DPR rule</p><p className="text-xs text-muted-foreground">Complete your tasks, review the auto-filled DPR, then submit before the SLA.</p></div></CardContent></Card></div>
  </div>;
}
