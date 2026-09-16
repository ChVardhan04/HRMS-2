'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { api } from '@/lib/api-client';
import { ClipboardList, Clock3, FileText, ListChecks, UserRound } from 'lucide-react';

function fmtTime(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-';
}

async function openProof(taskId: string) {
  const result = await api.get<any>(`/todos/${taskId}/proof`);
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

export default function ActivityMonitorPage() {
  const initialDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [date, setDate] = useState(initialDate);
  const [employeeId, setEmployeeId] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: employees } = useQuery({
    queryKey: ['employees', 'activity-monitor'],
    queryFn: () => api.get<any>('/employees?pageSize=200&page=1&includeExited=false'),
  });
  const { data, isFetching } = useQuery({
    queryKey: ['reports', 'daily-activity', date, employeeId],
    queryFn: () => api.get<any>(`/reports/daily-activity?date=${date}${employeeId !== 'all' ? `&employeeId=${employeeId}` : ''}`),
  });

  const rows = data?.rows ?? [];
  const selected = rows.find((r: any) => r.employee.id === selectedId) ?? null;
  const summary = useMemo(() => ({
    submitted: rows.filter((r: any) => ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(r.dpr?.status)).length,
    missing: rows.filter((r: any) => !['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(r.dpr?.status ?? '')).length,
    present: rows.filter((r: any) => ['PRESENT', 'LATE', 'HALF_DAY', 'WORK_FROM_HOME'].includes(r.attendance.status)).length,
  }), [rows]);

  return (
    <AppShell title="Daily Activity">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Employee daily activity</CardTitle>
            <p className="text-xs text-muted-foreground">Select a day and employee to see attendance, DPR submission and all To-Do activity in one place.</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div><label className="text-xs text-muted-foreground">Date</label><Input type="date" value={date} onChange={e => { setDate(e.target.value); setSelectedId(null); }} /></div>
              <div className="min-w-[240px]"><label className="text-xs text-muted-foreground">Employee</label><Select value={employeeId} onValueChange={v => { setEmployeeId(v); setSelectedId(null); }}><SelectTrigger><SelectValue placeholder="All employees" /></SelectTrigger><SelectContent><SelectItem value="all">All employees</SelectItem>{employees?.data?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeCode}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex flex-wrap gap-2"><Badge variant="outline">Present {summary.present}</Badge><Badge variant="success">DPR submitted {summary.submitted}</Badge><Badge variant="destructive">DPR missing {summary.missing}</Badge></div>
            </div>
          </CardContent>
        </Card>

        {isFetching ? <div className="h-48 animate-pulse rounded-md bg-muted" /> : !rows.length ? <EmptyState icon={UserRound} title="No employees found" /> : (
          <Card>
            <CardHeader><CardTitle>Employees</CardTitle></CardHeader>
            <CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-2 py-2">Employee</th><th className="px-2 py-2">Attendance</th><th className="px-2 py-2">Check-in/out</th><th className="px-2 py-2">DPR</th><th className="px-2 py-2">To-Dos</th><th className="px-2 py-2">Action</th></tr></thead><tbody>{rows.map((r: any) => <tr key={r.employee.id} className="border-b last:border-0"><td className="px-2 py-3"><p className="font-medium">{r.employee.firstName} {r.employee.lastName}</p><p className="text-xs text-muted-foreground">{r.employee.employeeCode} · {r.employee.department?.name ?? 'No department'}</p></td><td className="px-2 py-3"><StatusBadge status={r.attendance.status} /></td><td className="px-2 py-3">{fmtTime(r.attendance.checkInAt)} / {fmtTime(r.attendance.checkOutAt)}<p className="text-xs text-muted-foreground">{r.attendance.workingHours != null ? `${Number(r.attendance.workingHours).toFixed(2)}h` : '-'}</p></td><td className="px-2 py-3"><StatusBadge status={r.dpr?.status ?? 'DRAFT'} />{r.dpr?.submittedAt && <p className="text-xs text-muted-foreground">Submitted {fmtTime(r.dpr.submittedAt)}</p>}</td><td className="px-2 py-3">{r.tasks.resolved}/{r.tasks.total}<p className="text-xs text-muted-foreground">{r.tasks.pending} pending</p></td><td className="px-2 py-3"><Button size="sm" variant="outline" onClick={() => setSelectedId(r.employee.id)}>View details</Button></td></tr>)}</tbody></table></div></CardContent>
          </Card>
        )}

        {selected && <Card><CardHeader><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><CardTitle>{selected.employee.firstName} {selected.employee.lastName}</CardTitle><p className="text-xs text-muted-foreground">{date} · {selected.employee.employeeCode}</p></div><Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button></div></CardHeader><CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4"><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Attendance</p><StatusBadge status={selected.attendance.status} /></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">DPR</p><StatusBadge status={selected.dpr?.status ?? 'DRAFT'} /></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Tasks</p><p className="font-semibold">{selected.tasks.resolved}/{selected.tasks.total} resolved</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">AI task score</p><p className="font-semibold">{selected.dpr?.aiCompletionPercent == null ? '-' : `${selected.dpr.aiCompletionPercent}%`}</p></div></div>
          <section><h3 className="mb-2 flex items-center gap-2 font-semibold"><ListChecks className="h-4 w-4" /> To-Dos</h3>{!selected.tasks.items.length ? <p className="text-sm text-muted-foreground">No To-Dos for this day.</p> : <div className="space-y-2">{selected.tasks.items.map((t: any) => <div key={t.id} className="rounded-lg border p-3"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><p className="font-medium">{t.title}</p><div className="flex gap-2"><Badge variant={t.eodStatus === 'COMPLETED' ? 'success' : t.eodStatus === 'INCOMPLETE' ? 'muted' : 'destructive'}>{t.eodStatus}</Badge>{t.aiCompletionPercent != null && <Badge variant="outline">AI {Number(t.aiCompletionPercent).toFixed(0)}%</Badge>}</div></div>{t.actualHours != null && <p className="mt-1 text-xs text-muted-foreground">Actual hours: {Number(t.actualHours).toFixed(2)}h</p>}{t.completionOutputSummary && <p className="mt-1 text-sm">{t.completionOutputSummary}</p>}{t.incompleteReason && <p className="mt-1 text-xs text-muted-foreground">Reason: {t.incompleteReason}</p>}{t.completionProofFileName && <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>Proof: {t.completionProofFileName}</span><Button size="sm" variant="ghost" onClick={() => openProof(t.id).catch(() => undefined)}>View proof</Button></div>}</div>)}</div>}</section>
          <section><h3 className="mb-2 flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> DPR submission</h3>{!selected.dpr ? <p className="text-sm text-muted-foreground">No DPR created for this day.</p> : <div className="space-y-2"><div className="rounded-lg bg-muted/40 p-3 text-sm">Submitted: {selected.dpr.submittedAt ? fmtTime(selected.dpr.submittedAt) : 'Not submitted'}{selected.dpr.qualityScore != null ? ` · Quality ${Number(selected.dpr.qualityScore).toFixed(1)}/10` : ''}</div>{selected.dpr.entries.map((e: any) => <div key={e.id} className="rounded-lg border p-3"><div className="flex justify-between gap-3"><p className="font-medium">{e.description}</p><Badge variant="outline">{Number(e.hours).toFixed(2)}h</Badge></div>{e.output && <p className="mt-1 text-sm">{e.output}</p>}{e.blocker && <p className="mt-1 text-xs text-muted-foreground">Blocker: {e.blocker}</p>}{e.tomorrowPlan && <p className="mt-1 text-xs text-muted-foreground">Tomorrow: {e.tomorrowPlan}</p>}</div>)}</div>}</section>
          <section><h3 className="mb-2 flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" /> Attendance events</h3>{!selected.attendanceRecords.length ? <p className="text-sm text-muted-foreground">No attendance events recorded.</p> : <div className="space-y-1">{selected.attendanceRecords.map((a: any) => <p key={a.id} className="text-sm">{a.type.replaceAll('_',' ')} · {fmtTime(a.timestamp)}{a.note ? ` · ${a.note}` : ''}</p>)}</div>}</section>
        </CardContent></Card>}
      </div>
    </AppShell>
  );
}
