'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { LeaveBalanceCard } from '@/components/leave/leave-balance-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useApplyLeave, useLeaveHistory, useLeaveTypes, useLeaveApprovals, useApproveManagerLeave, useApproveHrLeave, useRejectLeave, useCancelLeave } from '@/features/leave/use-leave';
import { formatDate } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { CalendarPlus, History, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';

export default function LeavePage() {
  const { data: types } = useLeaveTypes();
  const { data: history } = useLeaveHistory();
  const applyLeave = useApplyLeave();
  const isManager = useAuthStore((s) => s.hasRole('MANAGER'));
  const isHr = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const { data: approvals } = useLeaveApprovals(isManager || isHr);
  const managerApprove = useApproveManagerLeave();
  const hrApprove = useApproveHrLeave();
  const rejectLeave = useRejectLeave();
  const cancelLeave = useCancelLeave();
  const qc = useQueryClient(); const { toast } = useToast();
  const reverseLeave = useMutation({ mutationFn: (id: string) => api.patch(`/leave/${id}/reverse`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave'] }); toast({ title: 'Approved leave reversed', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Could not reverse leave', description: e.message, variant: 'destructive' }) });

  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  return (
    <AppShell title="Leave">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <LeaveBalanceCard />

          {(isManager || isHr) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {isHr ? 'HR approval queue' : 'Team leave approvals'}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {isHr ? "HR gives final approval after the employee's manager approves." : "Approve or reject leave requests from your direct reports."}
                </p>
              </CardHeader>
              <CardContent>
                {!approvals?.length ? (
                  <EmptyState icon={CheckCircle2} title="No requests waiting" />
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {approvals.map((r: any) => (
                      <div key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">{r.employee.firstName} {r.employee.lastName} · {r.leaveType.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(r.startDate)} – {formatDate(r.endDate)} · {Number(r.numberOfDays)} day(s) · {r.status.replace('_', ' ')}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => isHr ? hrApprove.mutate(r.id) : managerApprove.mutate(r.id)}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => rejectLeave.mutate({ id: r.id, reason: 'Rejected by approver' })}>Reject</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" /> Leave history
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!history?.length ? (
                <EmptyState icon={History} title="No leave requests yet" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead><TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h: any) => (
                      <TableRow key={h.id}>
                        <TableCell>{h.leaveType.name}</TableCell>
                        <TableCell>{formatDate(h.startDate)} – {formatDate(h.endDate)}</TableCell>
                        <TableCell>{Number(h.numberOfDays)}</TableCell>
                        <TableCell><StatusBadge status={h.status} /></TableCell><TableCell className="text-right">{isHr && h.status === 'APPROVED' ? <Button size="sm" variant="ghost" onClick={() => reverseLeave.mutate(h.id)}>Reverse</Button> : ['PENDING', 'MANAGER_APPROVED'].includes(h.status) && <Button size="sm" variant="ghost" onClick={() => cancelLeave.mutate(h.id)}>Cancel</Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4 text-primary" /> Apply for leave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                applyLeave.mutate({ leaveTypeId, startDate, endDate, reason });
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label>Leave type</Label>
                <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {types?.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Reason (optional)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <Button type="submit" disabled={!leaveTypeId || applyLeave.isPending}>
                Submit request
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
