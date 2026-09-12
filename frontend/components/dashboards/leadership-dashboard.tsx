'use client';

import { Users, TrendingUp, Briefcase, ShieldAlert, CalendarDays, Target } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function LeadershipDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['reports', 'leadership-summary'], queryFn: () => api.get<any>('/reports/leadership-summary') });
  const { data: hiringFunnel } = useQuery({ queryKey: ['reports', 'hiring-funnel'], queryFn: () => api.get<any[]>('/reports/hiring-funnel') });

  const attendanceTotal = data ? data.attendance.present + data.attendance.absent + data.attendance.onLeave : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active employees" value={isLoading ? '-' : data?.headcount ?? 0} icon={Users} />
        <StatCard label="Present today" value={isLoading ? '-' : `${data?.attendance?.present ?? 0}/${attendanceTotal}`} icon={TrendingUp} tone="success" />
        <StatCard label="Average KRA" value={data?.averageKra == null ? '-' : `${data.averageKra}%`} icon={Target} />
        <StatCard label="Open jobs" value={data?.openJobs ?? 0} icon={Briefcase} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5"><CalendarDays className="mb-2 h-5 w-5 text-primary"/><p className="text-sm text-muted-foreground">On leave today</p><p className="text-2xl font-semibold">{data?.attendance?.onLeave ?? 0}</p><p className="mt-1 text-xs text-muted-foreground">Pending leave requests: {data?.pendingLeaves ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-5"><ShieldAlert className="mb-2 h-5 w-5 text-primary"/><p className="text-sm text-muted-foreground">Active strikes</p><p className="text-2xl font-semibold">{data?.activeStrikes ?? 0}</p><p className="mt-1 text-xs text-muted-foreground">High-level view only</p></CardContent></Card>
        <Card><CardContent className="p-5"><Users className="mb-2 h-5 w-5 text-primary"/><p className="text-sm text-muted-foreground">Candidates</p><p className="text-2xl font-semibold">{data?.candidates ?? 0}</p><p className="mt-1 text-xs text-muted-foreground">Current ATS pipeline</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Department overview</CardTitle></CardHeader>
        <CardContent>
          {!data?.departments?.length ? <EmptyState icon={Users} title="No department data yet" /> : <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Department</th><th>Headcount</th><th>Average KRA</th></tr></thead><tbody>{data.departments.map((d:any)=><tr key={d.id} className="border-b last:border-0"><td className="py-2 font-medium">{d.name}</td><td>{d.headcount}</td><td>{d.averageKra == null ? '-' : `${d.averageKra}%`}</td></tr>)}</tbody></table></div>}
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Hiring funnel</CardTitle></CardHeader><CardContent className="h-72">{!hiringFunnel?.length ? <EmptyState icon={Briefcase} title="No candidate data yet" /> : <ResponsiveContainer width="100%" height="100%"><BarChart data={hiringFunnel}><CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border"/><XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70}/><YAxis allowDecimals={false} tick={{ fontSize: 11 }}/><Tooltip/><Bar dataKey="count" fill="hsl(245 75% 59%)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>}</CardContent></Card>
    </div>
  );
}
