'use client';

import { AlertCircle, CalendarDays, Clock, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/shared/stat-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useTeamToday } from '@/features/workday/use-workday';
import { usePendingReviews, useTeamDprStatus } from '@/features/dpr/use-dpr';
import { useLeaveApprovals } from '@/features/leave/use-leave';

export function ManagerDashboard() {
  const { data: team } = useTeamToday();
  const { data: pendingDprs } = usePendingReviews();
  const { data: dprTeam } = useTeamDprStatus(true);
  const { data: leaveApprovals } = useLeaveApprovals(true);

  const present = team?.filter((t: any) => ['PRESENT', 'LATE'].includes(t.attendanceStatus)).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Team present today" value={`${present}/${team?.length ?? 0}`} icon={Users} />
        <StatCard label="Pending DPR reviews" value={pendingDprs?.length ?? 0} icon={Clock} tone="warning" />
        <StatCard label="Leave requests" value={leaveApprovals?.length ?? 0} icon={CalendarDays} tone="warning" />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Leave approvals</CardTitle></CardHeader>
        <CardContent>{!leaveApprovals?.length ? <EmptyState icon={CalendarDays} title="No leave requests" /> : <div className="flex flex-col divide-y divide-border text-sm">{leaveApprovals.map((r: any) => <div key={r.id} className="flex items-center justify-between py-2"><span>{r.employee.firstName} {r.employee.lastName} · {r.leaveType.name}</span><StatusBadge status={r.status} /></div>)}</div>}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team DPR status</CardTitle>
        </CardHeader>
        <CardContent>
          {!dprTeam?.length ? (
            <EmptyState icon={AlertCircle} title="No team DPR data" description="Your direct reports will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Employee</th><th>DPR</th><th>AI</th></tr></thead>
                <tbody>{dprTeam.map((row: any) => <tr key={row.employee.id} className="border-b last:border-0"><td className="py-2 font-medium">{row.employee.firstName} {row.employee.lastName}</td><td><StatusBadge status={row.dprStatus} /></td><td>{row.aiSummary?.score == null ? '-' : `${Number(row.aiSummary.score).toFixed(0)}%`}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending DPR reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {!pendingDprs?.length ? (
            <EmptyState icon={AlertCircle} title="Nothing pending" description="All caught up on team DPR reviews." />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {pendingDprs.map((dpr: any) => (
                <div key={dpr.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div><p className="font-medium">{dpr.workDay.employee.firstName} {dpr.workDay.employee.lastName}</p><p className="text-xs text-muted-foreground">AI {dpr.aiSummary?.score == null ? 'pending' : `${Number(dpr.aiSummary.score).toFixed(0)}%`}</p></div>
                  <StatusBadge status={dpr.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
