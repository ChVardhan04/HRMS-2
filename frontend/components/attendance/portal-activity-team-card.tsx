'use client';

import { Clock3, Laptop, CheckCircle2, XCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/lib/auth-store';

export function PortalActivityTeamCard({ team = [], title = 'Portal activity today' }: { team?: any[]; title?: string }) {
  const roles = useAuthStore((s) => s.user?.roles ?? []);
  const canReview = roles.includes('HR_ADMIN') || roles.includes('SUPER_ADMIN');
  const qc = useQueryClient();
  const { toast } = useToast();
  const review = useMutation({
    mutationFn: ({ employeeId, status }: { employeeId: string; status: 'APPROVED' | 'REJECTED' }) =>
      api.post(`/attendance/portal-activity/${employeeId}/review`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-day', 'team-today'] });
      toast({ title: 'Portal activity review updated', variant: 'success' });
    },
    onError: (err: any) => toast({ title: 'Could not review portal activity', description: err.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Laptop className="h-4 w-4 text-primary" /> {title}</CardTitle>
        <p className="text-xs text-muted-foreground">Tracked HRMS time after check-in. Lunch is excluded. HR can review the portal time against the submitted DPR hours.</p>
      </CardHeader>
      <CardContent>
        {!team.length ? <p className="text-sm text-muted-foreground">No assigned employees found.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Employee</th><th>Attendance</th><th>Portal active</th><th>DPR hours</th><th>Checks</th><th>HR review</th></tr></thead>
              <tbody>{team.map((wd: any) => {
                const reviewStatus = wd.portalActivityReviewStatus ?? 'PENDING';
                return <tr key={wd.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{wd.employee.firstName} {wd.employee.lastName}</td>
                  <td>{wd.attendanceStatus}</td>
                  <td className="font-medium">{(Number(wd.portalActiveMinutes ?? 0) / 60).toFixed(1)}h</td>
                  <td>{Number(wd.totalLoggedHours ?? 0).toFixed(1)}h</td>
                  <td>{wd.portalHeartbeatCount ?? 0}</td>
                  <td>
                    {canReview && wd.dprStatus !== 'DRAFT' && reviewStatus === 'PENDING' ? (
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => review.mutate({ employeeId: wd.employee.id, status: 'APPROVED' })} disabled={review.isPending}><CheckCircle2 className="mr-1 h-3 w-3" />Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => review.mutate({ employeeId: wd.employee.id, status: 'REJECTED' })} disabled={review.isPending}><XCircle className="mr-1 h-3 w-3" />Reject</Button>
                      </div>
                    ) : (
                      <Badge variant={reviewStatus === 'APPROVED' ? 'success' : reviewStatus === 'REJECTED' ? 'destructive' : 'outline'}>{reviewStatus}</Badge>
                    )}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
