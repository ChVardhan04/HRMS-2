'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileBarChart, Users, Clock3 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/status-badge';
import { api, downloadFile } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

function time(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-';
}

export default function ReportsPage() {
  const now = new Date();
  const isHr = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [date, setDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now));
  const [employeeId, setEmployeeId] = useState('all');

  const { data: employees } = useQuery({
    queryKey: ['employees', 'reports'],
    queryFn: () => api.get<any>('/employees?pageSize=200&page=1&includeExited=false'),
    enabled: isHr,
  });
  const { data: daily, isFetching: dailyLoading } = useQuery({
    queryKey: ['reports', 'daily-activity', date, employeeId],
    queryFn: () => api.get<any>(`/reports/daily-activity?date=${date}${employeeId !== 'all' ? `&employeeId=${employeeId}` : ''}`),
    enabled: isHr,
  });
  const { data: dailyAttendance, isFetching: attendanceLoading } = useQuery({
    queryKey: ['reports', 'daily-attendance', month, year, employeeId],
    queryFn: () => api.get<any>(`/reports/daily-attendance?month=${month}&year=${year}${employeeId !== 'all' ? `&employeeId=${employeeId}` : ''}`),
    enabled: isHr,
  });
  const { data: dpr } = useQuery({
    queryKey: ['reports', 'dpr-compliance', month, year],
    queryFn: () => api.get<any>(`/reports/dpr-compliance?month=${month}&year=${year}`),
    enabled: isHr,
  });
  const { data: calendar } = useQuery({
    queryKey: ['calendar', 'summary', month, year],
    queryFn: () => api.get<any>(`/calendar/summary?month=${month}&year=${year}`),
    enabled: isHr,
  });
  const { data: payReport } = useQuery({
    queryKey: ['reports', 'pay-attendance', month, year],
    queryFn: () => api.get<any>(`/reports/pay-attendance?month=${month}&year=${year}`),
    enabled: isHr,
  });

  function exportCsv() {
    if (!payReport?.rows) return;
    const header = ['Employee Code','Employee','Department','Working Days','Present','WFH','Paid Leave','Unpaid Leave','Half Day','Absent','Late','Working Hours','Payable Days','Attendance %','Monthly Salary','Payable Amount'];
    const rows = payReport.rows.map((r: any) => [r.employee.employeeCode, `${r.employee.firstName} ${r.employee.lastName}`, r.employee.department ?? '', r.workingDays, r.present, r.wfh, r.paidLeave, r.unpaidLeave, r.halfDay, r.absent, r.late, Number(r.workingHours).toFixed(2), r.payableDays, r.attendanceRate, r.monthlySalary ?? '', r.payableAmount ?? '']);
    const csv = [header, ...rows].map((row) => row.map((v: any) => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `hrms-attendance-${year}-${String(month).padStart(2,'0')}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Reports">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        {!isHr ? (
          <Card><CardHeader><CardTitle>Organization reports</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Detailed employee-wise and day-wise attendance, DPR and To-Do reports are available to HR. Leadership can use the organization-level dashboard.</p></CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><FileBarChart className="h-4 w-4 text-primary" /> HR reports</CardTitle><p className="text-xs text-muted-foreground">Filter by day and employee to see exactly what happened. The monthly section shows every employee and every day.</p></CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div><label className="text-xs text-muted-foreground">Report day</label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
                  <div className="min-w-[260px]"><label className="text-xs text-muted-foreground">Employee</label><Select value={employeeId} onValueChange={setEmployeeId}><SelectTrigger><SelectValue placeholder="All employees" /></SelectTrigger><SelectContent><SelectItem value="all">All employees</SelectItem>{employees?.data?.map((e:any)=><SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeCode}</SelectItem>)}</SelectContent></Select></div>
                  <div className="flex gap-2"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button><Button onClick={()=>downloadFile(`/reports/month-end.xlsx?month=${month}&year=${year}`,`hrms-month-end-${year}-${String(month).padStart(2,'0')}.xlsx`)}><Download className="h-4 w-4" /> Month-end XLSX</Button></div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Working days</p><p className="mt-1 text-3xl font-semibold">{calendar?.workingDays ?? '-'}</p></CardContent></Card>
              <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">DPR compliance</p><p className="mt-1 text-3xl font-semibold">{dpr ? `${dpr.complianceRate}%` : '-'}</p><p className="text-xs text-muted-foreground">{dpr ? `${dpr.submitted} submitted / ${dpr.expectedDprs} expected` : 'Loading...'}</p></CardContent></Card>
              <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Employees in daily report</p><p className="mt-1 text-3xl font-semibold">{daily?.rows?.length ?? '-'}</p></CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /> Daily attendance, DPR & To-Dos</CardTitle><p className="text-xs text-muted-foreground">Every employee appears for the selected day. Missing DPRs are shown instead of disappearing.</p></CardHeader>
              <CardContent>{dailyLoading ? <div className="h-40 animate-pulse rounded-md bg-muted" /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Attendance</TableHead><TableHead>Check-in</TableHead><TableHead>Check-out</TableHead><TableHead>Hours</TableHead><TableHead>DPR</TableHead><TableHead>To-Dos</TableHead></TableRow></TableHeader><TableBody>{daily?.rows?.map((r:any)=><TableRow key={r.employee.id}><TableCell><p className="font-medium">{r.employee.firstName} {r.employee.lastName}</p><p className="text-xs text-muted-foreground">{r.employee.employeeCode} · {r.employee.department?.name ?? '-'}</p></TableCell><TableCell><StatusBadge status={r.attendance.status}/></TableCell><TableCell>{time(r.attendance.checkInAt)}</TableCell><TableCell>{time(r.attendance.checkOutAt)}</TableCell><TableCell>{r.attendance.workingHours != null ? Number(r.attendance.workingHours).toFixed(2) : '-'}</TableCell><TableCell><StatusBadge status={r.dpr?.status ?? 'DRAFT'}/>{r.dpr?.submittedAt && <p className="text-xs text-muted-foreground">Submitted {time(r.dpr.submittedAt)}</p>}</TableCell><TableCell>{r.tasks.resolved}/{r.tasks.total}{r.tasks.pending ? <span className="ml-1 text-xs text-muted-foreground">({r.tasks.pending} pending)</span> : null}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent>
            </Card>

            <Card>
              <CardHeader><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Monthly day-wise attendance</CardTitle><p className="text-xs text-muted-foreground">Every employee and every calendar day for the selected month.</p></div><div className="flex gap-2"><Input className="w-32" type="number" min="1" max="12" value={month} onChange={e=>setMonth(Number(e.target.value))}/><Input className="w-28" type="number" value={year} onChange={e=>setYear(Number(e.target.value))}/></div></div></CardHeader>
              <CardContent>{attendanceLoading ? <div className="h-40 animate-pulse rounded-md bg-muted" /> : !dailyAttendance?.rows?.length ? <p className="text-sm text-muted-foreground">No attendance data.</p> : <div className="max-h-[560px] overflow-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Employee</TableHead><TableHead>Status</TableHead><TableHead>In</TableHead><TableHead>Out</TableHead><TableHead>Hours</TableHead><TableHead>DPR</TableHead><TableHead>To-Dos</TableHead></TableRow></TableHeader><TableBody>{dailyAttendance.rows.map((r:any)=><TableRow key={`${r.employee.id}-${r.date}`}><TableCell>{r.date}</TableCell><TableCell><p className="font-medium">{r.employee.firstName} {r.employee.lastName}</p><p className="text-xs text-muted-foreground">{r.employee.employeeCode}</p></TableCell><TableCell><StatusBadge status={r.status}/></TableCell><TableCell>{time(r.checkInAt)}</TableCell><TableCell>{time(r.checkOutAt)}</TableCell><TableCell>{r.workingHours != null ? Number(r.workingHours).toFixed(2) : '-'}</TableCell><TableCell><StatusBadge status={r.dprStatus}/></TableCell><TableCell>{r.todoResolved}/{r.todoTotal}{r.todoPending ? <span className="ml-1 text-xs text-muted-foreground">({r.todoPending})</span> : null}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
