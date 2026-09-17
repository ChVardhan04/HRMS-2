'use client';

import { Clock3, Laptop } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PortalActivityTeamCard({ team = [], title = 'Portal activity today' }: { team?: any[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Laptop className="h-4 w-4 text-primary" /> {title}</CardTitle>
        <p className="text-xs text-muted-foreground">Hours the HRMS portal has been kept open after check-in. The configured lunch window is excluded.</p>
      </CardHeader>
      <CardContent>
        {!team.length ? <p className="text-sm text-muted-foreground">No assigned employees found.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Employee</th><th>Attendance</th><th>Portal active</th><th>Hourly checks</th></tr></thead>
              <tbody>{team.map((wd: any) => <tr key={wd.id} className="border-b last:border-0"><td className="py-2 font-medium">{wd.employee.firstName} {wd.employee.lastName}</td><td>{wd.attendanceStatus}</td><td className="font-medium">{(Number(wd.portalActiveMinutes ?? 0) / 60).toFixed(1)}h</td><td>{wd.portalHeartbeatCount ?? 0}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
