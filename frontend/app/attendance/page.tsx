'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { CheckInWidget } from '@/components/attendance/check-in-widget';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useAuthStore } from '@/lib/auth-store';
import { useTeamToday } from '@/features/workday/use-workday';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { Users, Clock3, CalendarDays, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function AttendancePage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const isManagerOrAbove = hasRole(
    'MANAGER',
    'HR_ADMIN',
    'SUPER_ADMIN',
  );

  const { data: team } = useTeamToday();

  const [regularise, setRegularise] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [requestedCheckIn, setRequestedCheckIn] = useState('');
  const [requestedCheckOut, setRequestedCheckOut] = useState('');

  const qc = useQueryClient();
  const { toast } = useToast();

  // ---------------------------------------------------------
  // Request attendance regularisation
  // ---------------------------------------------------------
  const request = useMutation({
    mutationFn: () =>
      api.post('/attendance/regularise', {
        workDayId: regularise.id,
        reason,
        requestedCheckIn: requestedCheckIn
          ? new Date(requestedCheckIn).toISOString()
          : undefined,
        requestedCheckOut: requestedCheckOut
          ? new Date(requestedCheckOut).toISOString()
          : undefined,
      }),

    onSuccess: () => {
      setRegularise(null);
      setReason('');
      setRequestedCheckIn('');
      setRequestedCheckOut('');

      qc.invalidateQueries({
        queryKey: ['work-day'],
      });

      qc.invalidateQueries({
        queryKey: ['attendance', 'regularise', 'pending'],
      });

      toast({
        title: 'Regularisation requested',
        variant: 'success',
      });
    },

    onError: (e: any) => {
      toast({
        title: 'Could not request regularisation',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // ---------------------------------------------------------
  // Pending regularisation requests
  // ---------------------------------------------------------
  const { data: pending } = useQuery({
    queryKey: ['attendance', 'regularise', 'pending'],
    queryFn: () =>
      api.get<any[]>('/attendance/regularise/pending'),
    enabled: isManagerOrAbove,
  });

  // ---------------------------------------------------------
  // Approve regularisation
  // ---------------------------------------------------------
  const approve = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/attendance/regularise/${id}/approve`),

    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['attendance', 'regularise', 'pending'],
      });

      qc.invalidateQueries({
        queryKey: ['work-day', 'history', 'me'],
      });

      qc.invalidateQueries({
        queryKey: ['work-day'],
      });

      toast({
        title: 'Regularisation approved',
        variant: 'success',
      });
    },

    onError: (error: any) => {
      toast({
        title: 'Could not approve regularisation',
        description:
          error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // ---------------------------------------------------------
  // My attendance history
  // ---------------------------------------------------------
  const { data: history } = useQuery({
    queryKey: ['work-day', 'history', 'me'],
    queryFn: () =>
      api.get<any[]>('/work-days/history/me'),
    enabled: true,
  });

  const now = new Date();
  const [reportMonth, setReportMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const reportYear = Number(reportMonth.slice(0,4));
  const reportMonthNo = Number(reportMonth.slice(5,7));
  const { data: monthly } = useQuery({
    queryKey: ['attendance','monthly','me',reportMonth],
    queryFn: () => api.get<any>(`/attendance/monthly/me?month=${reportMonthNo}&year=${reportYear}`),
  });
  const { data: monthlyTeam } = useQuery({
    queryKey: ['attendance','monthly','team',reportMonth],
    queryFn: () => api.get<any>(`/attendance/monthly/team?month=${reportMonthNo}&year=${reportYear}`),
    enabled: isManagerOrAbove && hasRole('HR_ADMIN','SUPER_ADMIN'),
  });

  return (
    <AppShell title="Attendance">
      <div className="flex flex-col gap-4">

        {/* =====================================================
            CHECK IN
        ====================================================== */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CheckInWidget />
        </div>

        {/* =====================================================
            MONTHLY ATTENDANCE SUMMARY
        ====================================================== */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Monthly attendance</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Working days follow your department calendar. A third monthly late creates one full-day attendance deduction.</p>
              </div>
              <Input type="month" value={reportMonth} onChange={(e)=>setReportMonth(e.target.value)} className="w-44" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              <Stat label="Worked" value={monthly ? `${monthly.workedDays}` : '-'} />
              <Stat label="Total working" value={monthly?.totalWorkingDays ?? '-'} />
              <Stat label="Effective days" value={monthly?.effectiveWorkingDays ?? '-'} />
              <Stat label="Present" value={monthly?.presentDays ?? '-'} />
              <Stat label="Half days" value={monthly?.halfDays ?? '-'} />
              <Stat label="Late count" value={monthly?.lateCount ?? '-'} />
              <Stat label="Late deduction" value={monthly ? `${monthly.latePenaltyDays} day` : '-'} />
            </div>
          </CardContent>
        </Card>

        {hasRole('HR_ADMIN','SUPER_ADMIN') && (
          <Card>
            <CardHeader><CardTitle>Monthly attendance by employee</CardTitle></CardHeader>
            <CardContent>{!monthlyTeam?.rows?.length ? <p className="text-sm text-muted-foreground">No employee attendance data for this month.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Worked</TableHead><TableHead>Total working</TableHead><TableHead>Late</TableHead><TableHead>Deduction</TableHead><TableHead>Rate</TableHead></TableRow></TableHeader><TableBody>{monthlyTeam.rows.map((r:any)=><TableRow key={r.employee.id}><TableCell><p className="font-medium">{r.employee.firstName} {r.employee.lastName}</p><p className="text-xs text-muted-foreground">{r.employee.employeeCode}</p></TableCell><TableCell>{r.employee.department?.name ?? '-'}</TableCell><TableCell>{r.workedDays}</TableCell><TableCell>{r.totalWorkingDays}</TableCell><TableCell>{r.lateCount}</TableCell><TableCell>{r.latePenaltyDays ? <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5"/>{r.latePenaltyDays} day</span> : '0'}</TableCell><TableCell>{r.attendanceRate}%</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent>
          </Card>
        )}

        {/* =====================================================
            MY ATTENDANCE HISTORY
        ====================================================== */}
        <Card>
          <CardHeader>
            <CardTitle>My attendance history</CardTitle>
          </CardHeader>

          <CardContent>
            {!history?.length ? (
              <EmptyState
                icon={Users}
                title="No attendance history yet"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {history.map((wd: any) => (
                    <TableRow key={wd.id}>
                      <TableCell>
                        {wd.date.slice(0, 10)}
                      </TableCell>

                      <TableCell>
                        <StatusBadge
                          status={wd.attendanceStatus}
                        />
                      </TableCell>

                      <TableCell>
                        {wd.checkInAt
                          ? formatDateTime(wd.checkInAt)
                          : '-'}
                      </TableCell>

                      <TableCell>
                        {wd.checkOutAt
                          ? formatDateTime(wd.checkOutAt)
                          : '-'}
                      </TableCell>

                      <TableCell>
                        {wd.workingHours
                          ? Number(wd.workingHours).toFixed(2)
                          : '-'}
                      </TableCell>

                      <TableCell>
                        {/*
                          `canRegularise` is computed by the API from the single
                          shared rule (see backend regularisation.rules.ts), so
                          this button can never disagree with what the server
                          will accept. It appears only for absent, late,
                          half-day or missing-checkout rows — never for a clean
                          Present, Weekend, Holiday or Leave day.
                        */}
                        {wd.canRegularise && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Fix an attendance issue for this day (late or missing check-in, missing check-out)"
                            onClick={() => {
                              setRegularise(wd);
                              setReason('');
                              setRequestedCheckIn('');
                              setRequestedCheckOut('');
                            }}
                          >
                            Fix
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* =====================================================
            PENDING REGULARISATION
        ====================================================== */}
        {isManagerOrAbove && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                Pending regularisation
              </CardTitle>
            </CardHeader>

            <CardContent>
              {!pending?.length ? (
                <p className="text-sm text-muted-foreground">
                  No regularisation requests pending.
                </p>
              ) : (
                <div className="space-y-3">
                  {pending.map((r: any) => {
                    /*
                     * The backend stores the regularisation
                     * information inside r.note as JSON.
                     *
                     * Example:
                     * {
                     *   "reason": "Forgot",
                     *   "requestedCheckIn": "...",
                     *   "requestedCheckOut": "..."
                     * }
                     */

                    let details: any = {};

                    try {
                      details =
                        typeof r.note === 'string'
                          ? JSON.parse(r.note)
                          : r.note ?? {};
                    } catch {
                      details = {
                        reason:
                          r.note || 'No reason provided',
                      };
                    }

                    const requestedCheckIn =
                      details.requestedCheckIn
                        ? new Date(
                            details.requestedCheckIn,
                          )
                        : null;

                    const requestedCheckOut =
                      details.requestedCheckOut
                        ? new Date(
                            details.requestedCheckOut,
                          )
                        : null;

                    return (
                      <div
                        key={r.id}
                        className="rounded-lg border bg-card p-4"
                      >
                        <div className="flex flex-col gap-4">

                          {/* Employee + status */}
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-semibold">
                                {r.workDay?.employee?.firstName}{' '}
                                {r.workDay?.employee?.lastName}
                              </p>

                              <p className="text-sm text-muted-foreground">
                                {r.workDay?.date
                                  ? new Date(
                                      r.workDay.date,
                                    ).toLocaleDateString(
                                      'en-IN',
                                      {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                      },
                                    )
                                  : '-'}
                              </p>
                            </div>

                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                              Pending
                            </span>
                          </div>

                          {/* Details */}
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

                            {/* Reason */}
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">
                                Reason
                              </p>

                              <p className="mt-1 text-sm font-medium">
                                {details.reason ||
                                  'No reason provided'}
                              </p>
                            </div>

                            {/* Requested check-in */}
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">
                                Requested check-in
                              </p>

                              <p className="mt-1 text-sm font-medium">
                                {requestedCheckIn
                                  ? requestedCheckIn.toLocaleTimeString(
                                      'en-IN',
                                      {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      },
                                    )
                                  : '-'}
                              </p>
                            </div>

                            {/* Requested check-out */}
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">
                                Requested check-out
                              </p>

                              <p className="mt-1 text-sm font-medium">
                                {requestedCheckOut
                                  ? requestedCheckOut.toLocaleTimeString(
                                      'en-IN',
                                      {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      },
                                    )
                                  : '-'}
                              </p>
                            </div>
                          </div>

                          {/* Action */}
                          <div className="flex justify-end border-t pt-3">
                            <Button
                              size="sm"
                              onClick={() =>
                                approve.mutate(r.id)
                              }
                              disabled={approve.isPending}
                            >
                              {approve.isPending
                                ? 'Approving...'
                                : 'Approve'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* =====================================================
            TEAM ATTENDANCE TODAY
        ====================================================== */}
        {isManagerOrAbove && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Team attendance today
              </CardTitle>
            </CardHeader>

            <CardContent>
              {!team?.length ? (
                <EmptyState
                  icon={Users}
                  title="No team members found"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>DPR</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {team.map((wd: any) => (
                      <TableRow key={wd.id}>
                        <TableCell>
                          {wd.employee.firstName}{' '}
                          {wd.employee.lastName}
                        </TableCell>

                        <TableCell>
                          <StatusBadge
                            status={wd.attendanceStatus}
                          />
                        </TableCell>

                        <TableCell>
                          {wd.checkInAt
                            ? formatDateTime(wd.checkInAt)
                            : '-'}
                        </TableCell>

                        <TableCell>
                          {wd.checkOutAt
                            ? formatDateTime(wd.checkOutAt)
                            : '-'}
                        </TableCell>

                        <TableCell>
                          <StatusBadge
                            status={wd.dprStatus}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* =======================================================
          REGULARISATION DIALOG
      ======================================================== */}
      <Dialog
        open={Boolean(regularise)}
        onOpenChange={(open) => {
          if (!open) {
            setRegularise(null);
            setReason('');
            setRequestedCheckIn('');
            setRequestedCheckOut('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Request attendance regularisation
            </DialogTitle>
          </DialogHeader>

          {regularise && (
            <div className="space-y-4">

              <p className="text-sm text-muted-foreground">
                {regularise.date.slice(0, 10)} · Correct a
                missed or inaccurate attendance record.
              </p>

              {/* Reason */}
              <div>
                <Label>Reason</Label>

                <Input
                  required
                  value={reason}
                  onChange={(e) =>
                    setReason(e.target.value)
                  }
                  placeholder="Forgot to check in"
                />
              </div>

              {/* Requested check-in */}
              <div>
                <Label>Requested check-in</Label>

                <Input
                  type="datetime-local"
                  value={requestedCheckIn}
                  onChange={(e) =>
                    setRequestedCheckIn(e.target.value)
                  }
                />
              </div>

              {/* Requested check-out */}
              <div>
                <Label>Requested check-out</Label>

                <Input
                  type="datetime-local"
                  value={requestedCheckOut}
                  onChange={(e) =>
                    setRequestedCheckOut(e.target.value)
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRegularise(null);
                setReason('');
                setRequestedCheckIn('');
                setRequestedCheckOut('');
              }}
            >
              Cancel
            </Button>

            <Button
              onClick={() => request.mutate()}
              disabled={
                !regularise ||
                !reason.trim() ||
                request.isPending
              }
            >
              {request.isPending
                ? 'Submitting...'
                : 'Submit request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Stat({label,value}:{label:string;value:any}) {
  return <div className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}
