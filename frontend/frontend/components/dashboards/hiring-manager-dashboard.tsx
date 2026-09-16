'use client';

import { Briefcase, Users, Calendar, FileCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';

export function HiringManagerDashboard() {
  const { data: requisitions } = useQuery({ queryKey: ['jobs', 'requisitions', 'open'], queryFn: () => api.get<any[]>('/jobs/requisitions?status=OPEN') });
  const { data: candidates } = useQuery({ queryKey: ['candidates', 'summary'], queryFn: () => api.get<any>('/candidates?pageSize=1') });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open jobs" value={requisitions?.length ?? 0} icon={Briefcase} />
        <StatCard label="Candidates" value={candidates?.meta?.total ?? '-'} icon={Users} />
        <StatCard label="Interviews this week" value="-" icon={Calendar} />
        <StatCard label="Pending feedback" value="-" icon={FileCheck} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your open requisitions</CardTitle>
        </CardHeader>
        <CardContent>
          {!requisitions?.length ? (
            <EmptyState icon={Briefcase} title="No open requisitions" />
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {requisitions.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span>{r.title}</span>
                  <span className="text-xs text-muted-foreground">{r.headcount} opening(s)</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
