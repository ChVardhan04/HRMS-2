'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Clock, ShieldAlert, Users, CalendarDays, BriefcaseBusiness, MessagesSquare, UserCheck, FileWarning } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { useTeamToday } from '@/features/workday/use-workday';
import { formatDateTime } from '@/lib/utils';

export function HrDashboard() {
  const { data: employees } = useQuery({ queryKey: ['employees', 'summary'], queryFn: () => api.get<any>('/employees?pageSize=1') });
  const { data: dprCompliance } = useQuery({ queryKey: ['reports', 'dpr-compliance'], queryFn: () => api.get<any>('/reports/dpr-compliance') });
  const { data: leaveApprovals } = useQuery({ queryKey: ['leave', 'approvals'], queryFn: () => api.get<any[]>('/leave/approvals') });
  const { data: team } = useTeamToday();
  const { data: calendar } = useQuery({ queryKey: ['calendar', 'summary'], queryFn: () => api.get<any>('/calendar/summary') });
  const { data: stale } = useQuery({ queryKey: ['reports', 'stale'], queryFn: () => api.get<any>('/reports/stale-candidates-count') });
  const { data: groups } = useQuery({ queryKey: ['reports', 'groups'], queryFn: () => api.get<any[]>('/reports/group-compliance') });
  const { data: strikes } = useQuery({ queryKey: ['strikes', 'dashboard'], queryFn: () => api.get<any[]>('/strikes/dashboard') });

  const present = team?.filter((t: any) => ['PRESENT', 'LATE', 'WORK_FROM_HOME'].includes(t.attendanceStatus)).length ?? 0;
  const late = team?.filter((t: any) => t.attendanceStatus === 'LATE').length ?? 0;
  const absent = team?.filter((t: any) => t.attendanceStatus === 'ABSENT').length ?? 0;
  const pendingGroups = groups?.filter((g: any) => !g.lastChecked || new Date(g.lastChecked).toDateString() !== new Date().toDateString()).length ?? 0;
  const atRisk = strikes?.filter((s: any) => s.activeStrikes >= 2).length ?? 0;

  return <div className="flex flex-col gap-4">
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Active employees" value={employees?.meta?.total ?? '-'} icon={Users} />
      <StatCard label="In today" value={team ? `${present}/${team.length}` : '-'} icon={UserCheck} tone="success" />
      <StatCard label="DPR compliance" value={dprCompliance ? `${dprCompliance.complianceRate}%` : '-'} icon={ShieldAlert} tone="success" />
      <StatCard label="Pending leave" value={leaveApprovals?.length ?? 0} icon={CalendarDays} tone="warning" />
    </div>

    <div className="grid gap-4 md:grid-cols-3">
      <Link href="/group-monitor"><Card className="transition hover:border-primary/40"><CardContent className="p-5"><div className="flex items-center justify-between"><MessagesSquare className="h-5 w-5 text-primary" /><span className="text-2xl font-semibold">{pendingGroups}</span></div><p className="mt-3 text-sm font-medium">Groups pending check</p><p className="text-xs text-muted-foreground">Morning communication workflow</p></CardContent></Card></Link>
      <Link href="/ats"><Card className="transition hover:border-primary/40"><CardContent className="p-5"><div className="flex items-center justify-between"><BriefcaseBusiness className="h-5 w-5 text-primary" /><span className="text-2xl font-semibold">{stale?.count ?? 0}</span></div><p className="mt-3 text-sm font-medium">Stale candidates</p><p className="text-xs text-muted-foreground">Needs recruiter follow-up</p></CardContent></Card></Link>
      <Link href="/strikes"><Card className="transition hover:border-primary/40"><CardContent className="p-5"><div className="flex items-center justify-between"><FileWarning className="h-5 w-5 text-primary" /><span className="text-2xl font-semibold">{atRisk}</span></div><p className="mt-3 text-sm font-medium">Performance at risk</p><p className="text-xs text-muted-foreground">Employees with 2+ active strikes</p></CardContent></Card></Link>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Today's attendance</CardTitle></CardHeader><CardContent><div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span>Present: <strong className="text-foreground">{present}</strong></span><span>Late: <strong className="text-foreground">{late}</strong></span><span>Absent: <strong className="text-foreground">{absent}</strong></span></div>{!team?.length ? <EmptyState icon={Users} title="No employees found" /> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Employee</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>DPR</th></tr></thead><tbody>{team.map((wd: any) => <tr key={wd.id} className="border-b last:border-0"><td className="py-2 font-medium">{wd.employee.firstName} {wd.employee.lastName}</td><td><StatusBadge status={wd.attendanceStatus} /></td><td>{wd.checkInAt ? formatDateTime(wd.checkInAt) : '-'}</td><td>{wd.checkOutAt ? formatDateTime(wd.checkOutAt) : '-'}</td><td><StatusBadge status={wd.dprStatus} /></td></tr>)}</tbody></table></div>}</CardContent></Card>

    <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Company calendar</CardTitle></CardHeader><CardContent><p className="text-sm">{calendar?.workingDays ?? '-'} working days this month · {calendar?.holidays ?? 0} company holidays · {calendar?.optionalHolidays ?? 0} optional holidays.</p></CardContent></Card><Card><CardHeader><CardTitle>Leave approvals</CardTitle></CardHeader><CardContent>{!leaveApprovals?.length ? <EmptyState icon={CalendarDays} title="No leave approvals pending" /> : <div className="flex flex-col divide-y divide-border text-sm">{leaveApprovals.slice(0, 6).map((r: any) => <div key={r.id} className="flex items-center justify-between py-2"><span>{r.employee.firstName} {r.employee.lastName} · {r.leaveType.name}</span><StatusBadge status={r.status} /></div>)}</div>}</CardContent></Card></div>
  </div>;
}
