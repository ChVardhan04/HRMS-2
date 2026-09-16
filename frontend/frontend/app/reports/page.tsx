'use client';

import { useState } from 'react';
import { Download, FileBarChart, Users, WalletCards } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, downloadFile } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export default function ReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const isHr = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const { data: report, isFetching } = useQuery({ queryKey: ['reports', 'pay-attendance', month, year], queryFn: () => api.get<any>(isHr ? `/reports/pay-attendance?month=${month}&year=${year}` : `/reports/attendance?month=${month}&year=${year}`), enabled: true });
  const { data: calendar } = useQuery({ queryKey: ['calendar', 'summary', month, year], queryFn: () => api.get<any>(`/calendar/summary?month=${month}&year=${year}`) });
  const { data: dpr } = useQuery({ queryKey: ['reports', 'dpr-compliance', month, year], queryFn: () => api.get<any>(`/reports/dpr-compliance?month=${month}&year=${year}`) });

  function exportCsv() {
    if (!report?.rows) return;
    const header = isHr ? ['Employee Code','Employee','Department','Working Days','Present','WFH','Paid Leave','Unpaid Leave','Half Day','Absent','Late','Working Hours','Payable Days','Attendance %','Monthly Salary','Payable Amount'] : ['Employee Code','Employee','Department','Working Days','Present','WFH','Paid Leave','Unpaid Leave','Half Day','Absent','Late','Working Hours','Payable Days','Attendance %'];
    const rows = report.rows.map((r: any) => isHr ? [r.employee.employeeCode, `${r.employee.firstName} ${r.employee.lastName}`, r.employee.department ?? '', r.workingDays, r.present, r.wfh, r.paidLeave, r.unpaidLeave, r.halfDay, r.absent, r.late, Number(r.workingHours).toFixed(2), r.payableDays, r.attendanceRate, r.monthlySalary ?? '', r.payableAmount ?? ''] : [r.employee.employeeCode, `${r.employee.firstName} ${r.employee.lastName}`, r.employee.department ?? '', r.workingDays, r.present, r.wfh, r.paidLeave, r.unpaidLeave, r.halfDay, r.absent, r.late, Number(r.workingHours).toFixed(2), r.payableDays, r.attendanceRate]);
    const csv = [header, ...rows].map((row) => row.map((v: any) => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `hrms-pay-attendance-${year}-${String(month).padStart(2,'0')}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="HR Reports">
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2"><div><label className="text-xs text-muted-foreground">Month</label><Input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(Number(e.target.value))} /></div><div><label className="text-xs text-muted-foreground">Year</label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div><Button variant="outline" onClick={exportCsv} disabled={!report?.rows}><Download className="h-4 w-4" /> Export CSV</Button><Button onClick={() => downloadFile(`/reports/month-end.xlsx?month=${month}&year=${year}`, `hrms-month-end-${year}-${String(month).padStart(2,'0')}.xlsx`)}><Download className="h-4 w-4" /> Month-end XLSX</Button></div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDaysIcon /> Working days</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{calendar?.workingDays ?? '-'}</p><p className="text-xs text-muted-foreground">Calendar working days adjusted for employee lifecycle in each row.</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> DPR compliance</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{dpr ? `${dpr.complianceRate}%` : '-'}</p><p className="text-xs text-muted-foreground">{dpr ? `${dpr.submitted} submitted / ${dpr.expectedDprs} expected` : 'Loading...'}</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-primary" /> Pay report</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{report?.rows?.length ?? '-'}</p><p className="text-xs text-muted-foreground">{isHr ? 'Attendance and payable-day report.' : 'Attendance report. Salary data is restricted to HR.'}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><FileBarChart className="h-4 w-4 text-primary" /> Attendance & pay by employee</CardTitle></CardHeader>
          <CardContent>{isFetching ? <div className="h-48 animate-pulse rounded-md bg-muted" /> : <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Working</TableHead><TableHead>Present</TableHead><TableHead>WFH</TableHead><TableHead>Paid leave</TableHead><TableHead>Unpaid leave</TableHead><TableHead>Absent</TableHead><TableHead>Late</TableHead><TableHead>Hours</TableHead><TableHead>Payable days</TableHead><TableHead>Attendance</TableHead>{isHr && <TableHead>Payable amount</TableHead>}</TableRow></TableHeader><TableBody>{report?.rows?.map((r: any) => <TableRow key={r.employee.id}><TableCell><p className="font-medium">{r.employee.firstName} {r.employee.lastName}</p><p className="text-xs text-muted-foreground">{r.employee.employeeCode}</p></TableCell><TableCell>{r.workingDays}</TableCell><TableCell>{r.present}</TableCell><TableCell>{r.wfh}</TableCell><TableCell>{r.paidLeave}</TableCell><TableCell>{r.unpaidLeave}</TableCell><TableCell>{r.absent}</TableCell><TableCell>{r.late}</TableCell><TableCell>{r.workingHours.toFixed(2)}</TableCell><TableCell>{r.payableDays}</TableCell><TableCell>{r.attendanceRate}%</TableCell>{isHr && <TableCell>{r.payableAmount == null ? 'Not configured' : `${r.employee.salaryCurrency ?? 'INR'} ${Number(r.payableAmount).toLocaleString('en-IN')}`}</TableCell>}</TableRow>)}</TableBody></Table>}</CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function CalendarDaysIcon() { return <span className="inline-flex h-4 w-4 items-center justify-center text-primary">📅</span>; }
