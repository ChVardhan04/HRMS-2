'use client';

import { Users, TrendingUp, Briefcase, ShieldAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export function LeadershipDashboard() {
  const { data: employees } = useQuery({ queryKey: ['employees', 'summary'], queryFn: () => api.get<any[]>('/reports/employees') });
  const { data: hiringFunnel } = useQuery({ queryKey: ['reports', 'hiring-funnel'], queryFn: () => api.get<any[]>('/reports/hiring-funnel') });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Headcount" value={employees?.length ?? '-'} icon={Users} />
        <StatCard label="Attendance trend" value="Stable" icon={TrendingUp} tone="success" />
        <StatCard label="Hiring funnel" value={hiringFunnel?.reduce((s: number, x: any) => s + x.count, 0) ?? 0} icon={Briefcase} />
        <StatCard label="Strike trend" value="Low" icon={ShieldAlert} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hiring funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {!hiringFunnel?.length ? (
            <EmptyState icon={Briefcase} title="No candidate data yet" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hiringFunnel}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(245 75% 59%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
