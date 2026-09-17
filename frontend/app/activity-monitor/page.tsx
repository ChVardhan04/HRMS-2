'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { getTodoProof } from '@/features/todos/use-todos';
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, ChevronDown, ChevronUp, Eye, FileText, Users, Pencil, CheckCircle2 } from 'lucide-react';

function statusVariant(status?: string) {
  if (status === 'APPROVED' || status === 'SUBMITTED' || status === 'COMPLETED' || status === 'PRESENT') return 'success' as const;
  if (status === 'ABSENT' || status === 'REJECTED' || status === 'INCOMPLETE') return 'destructive' as const;
  return 'outline' as const;
}

export default function ActivityMonitorPage() {
  const isHr = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [employeeId, setEmployeeId] = useState('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['daily-activity', date, employeeId],
    queryFn: () => api.get<any>(`/reports/daily-activity?date=${date}${employeeId !== 'ALL' ? `&employeeId=${employeeId}` : ''}`),
    enabled: isHr,
    refetchInterval: 60000,
  });

  const rows = data?.rows ?? [];
  const selected = useMemo(() => rows.find((r: any) => r.employee.id === employeeId), [rows, employeeId]);

  async function openProof(task: any) {
    try {
      const result = await getTodoProof(task.id);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast({ title: 'Could not open proof', description: error.message, variant: 'destructive' });
    }
  }

  function startEdit(row: any) {
    if (!row.dpr || row.dpr.lockedAt) return;
    setEditing({
      row,
      entries: row.dpr.entries.map((entry: any) => ({
        ...entry,
        hours: Number(entry.hours ?? 0),
        output: entry.output ?? '',
        blocker: entry.blocker ?? '',
        tomorrowPlan: entry.tomorrowPlan ?? '',
        project: entry.project ?? '',
      })),
    });
  }

  function updateEntry(id: string, field: string, value: string) {
    setEditing((current: any) => current ? ({
      ...current,
      entries: current.entries.map((entry: any) => entry.id === id ? { ...entry, [field]: value } : entry),
    }) : current);
  }

  async function saveHrEdit() {
    if (!editing?.row?.dpr?.id) return;
    const total = editing.entries.reduce((sum: number, e: any) => sum + Number(e.hours || 0), 0);
    if (!editing.entries.length || total <= 0 || total > 24) {
      toast({ title: 'Invalid DPR hours', description: 'Total DPR hours must be greater than 0 and no more than 24.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/dpr/${editing.row.dpr.id}/hr-edit`, {
        entries: editing.entries.map((entry: any) => ({
          id: entry.id,
          todoId: entry.todoId ?? undefined,
          project: entry.project || undefined,
          description: entry.description,
          hours: Number(entry.hours),
          output: entry.output || undefined,
          blocker: entry.blocker || undefined,
          tomorrowPlan: entry.tomorrowPlan || undefined,
        })),
      });
      toast({ title: 'DPR updated', description: 'HR changes were saved.', variant: 'success' });
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['daily-activity'] });
    } catch (error: any) {
      toast({ title: 'Could not update DPR', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function approveFromActivity(row: any) {
    if (!row.dpr?.id || !['SUBMITTED', 'UNDER_REVIEW'].includes(row.dpr.status)) return;
    setApproving(true);
    try {
      await api.patch(`/dpr/${row.dpr.id}/approve`, {});
      toast({ title: 'DPR approved', description: `Approved by HR for ${row.employee.firstName} ${row.employee.lastName}.`, variant: 'success' });
      await qc.invalidateQueries({ queryKey: ['daily-activity'] });
    } catch (error: any) {
      toast({ title: 'Could not approve DPR', description: error.message, variant: 'destructive' });
    } finally {
      setApproving(false);
    }
  }

  if (!isHr) return null;

  return (
    <AppShell title="Daily Activity">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Daily employee activity</CardTitle>
            <p className="text-xs text-muted-foreground">Check attendance, DPR submission and To-Do work for every employee on any day. HR can also correct and approve submitted DPRs.</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-[180px_1fr]">
              <div><label className="mb-1 block text-xs text-muted-foreground">Date</label><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setExpanded(null); }} /></div>
              <div><label className="mb-1 block text-xs text-muted-foreground">Employee</label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setExpanded(null); }}><option value="ALL">All employees</option>{rows.map((r:any)=><option key={r.employee.id} value={r.employee.id}>{r.employee.firstName} {r.employee.lastName} · {r.employee.employeeCode}</option>)}</select></div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? <Card><CardContent className="h-48 animate-pulse rounded-md bg-muted" /></Card> : (
          <Card>
            <CardHeader><CardTitle>{date} · Employee activity</CardTitle></CardHeader>
            <CardContent>
              {!rows.length ? <p className="text-sm text-muted-foreground">No employees found.</p> : <div className="space-y-3">
                {rows.map((row:any) => {
                  const open = expanded === row.employee.id;
                  const canApprove = ['SUBMITTED', 'UNDER_REVIEW'].includes(row.dpr?.status);
                  const canEdit = Boolean(row.dpr && !row.dpr.lockedAt);
                  return <div key={row.employee.id} className="rounded-xl border">
                    <button className="w-full p-4 text-left" onClick={() => setExpanded(open ? null : row.employee.id)}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-3"><Users className="h-4 w-4 text-primary" /><div><p className="font-medium">{row.employee.firstName} {row.employee.lastName}</p><p className="text-xs text-muted-foreground">{row.employee.employeeCode} · {row.employee.department?.name ?? 'No department'} · {row.employee.designation?.title ?? 'No designation'}</p></div></div>
                        <div className="flex flex-wrap items-center gap-2"><Badge variant={statusVariant(row.attendance?.status)}>{row.attendance?.status ?? 'No attendance record'}</Badge><Badge variant={row.dpr ? statusVariant(row.dpr.status) : 'destructive'}>DPR: {row.dpr?.status ?? 'NOT SUBMITTED'}</Badge><Badge variant="outline">To-Dos: {row.todoSummary.total}</Badge><Badge variant="outline">Resolved: {row.todoSummary.resolved}</Badge>{open ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</div>
                      </div>
                    </button>
                    {open && <div className="border-t p-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <Info label="Check-in" value={row.attendance?.checkInAt ? new Date(row.attendance.checkInAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '-'} />
                        <Info label="Check-out" value={row.attendance?.checkOutAt ? new Date(row.attendance.checkOutAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '-'} />
                        <Info label="Working hours" value={row.attendance?.workingHours != null ? `${Number(row.attendance.workingHours).toFixed(2)}h` : '-'} />
                        <Info label="DPR hours" value={row.dpr ? `${Number(row.dpr.totalHours).toFixed(2)}h` : '-'} />
                        <Info label="DPR submitted" value={row.dpr?.submittedAt ? new Date(row.dpr.submittedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : 'No'} />
                      </div>

                      {row.dpr?.reviewedBy && (
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                          <p className="font-medium">{row.dpr.status === 'APPROVED' ? 'Approved' : 'Last reviewed'} by {row.dpr.reviewedBy.name}</p>
                          <p className="text-xs text-muted-foreground">{row.dpr.reviewedBy.roles?.includes('HR_ADMIN') || row.dpr.reviewedBy.roles?.includes('SUPER_ADMIN') ? 'HR' : 'Reporting Manager'} · {row.dpr.reviewedAt ? new Date(row.dpr.reviewedAt).toLocaleString('en-IN') : ''}</p>
                          {row.dpr.reviewComment && <p className="mt-1">Comment: {row.dpr.reviewComment}</p>}
                        </div>
                      )}

                      <section><h3 className="mb-2 flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4"/> To-Dos</h3>{!row.todos.length ? <p className="text-sm text-muted-foreground">No To-Dos for this day.</p> : <div className="space-y-2">{row.todos.map((task:any)=><div key={task.id} className="rounded-lg bg-muted/40 p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="font-medium">{task.title}</p><div className="flex flex-wrap gap-2"><Badge variant={statusVariant(task.eodStatus)}>{task.eodStatus}</Badge>{task.aiCompletionPercent != null && <Badge variant="outline">AI {Number(task.aiCompletionPercent).toFixed(0)}%</Badge>}</div></div>{task.completionOutputSummary && <p className="mt-1 text-sm">Output: {task.completionOutputSummary}</p>}{task.incompleteReason && <p className="mt-1 text-sm text-amber-700">Reason: {task.incompleteReason}</p>}{task.completionProofFileName && <Button size="sm" variant="ghost" className="mt-1" onClick={() => openProof(task)}><Eye className="mr-1 h-3.5 w-3.5"/> View proof</Button>}</div>)}</div>}</section>

                      <section><div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h3 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4"/> DPR</h3>{row.dpr && <div className="flex flex-wrap gap-2">{canEdit && <Button size="sm" variant="outline" onClick={() => startEdit(row)}><Pencil className="mr-1 h-3.5 w-3.5"/> Edit DPR</Button>}{canApprove && <Button size="sm" onClick={() => approveFromActivity(row)} disabled={approving}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>{approving ? 'Approving...' : 'Approve as HR'}</Button>}</div>}</div>{!row.dpr ? <p className="text-sm text-muted-foreground">DPR not submitted/created for this day.</p> : <div className="space-y-2">{row.dpr.entries.map((entry:any)=><div key={entry.id} className="rounded-lg border p-3"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><p className="font-medium">{entry.description}</p><span className="text-xs text-muted-foreground">{Number(entry.hours).toFixed(1)}h</span></div><p className="mt-1 text-sm">{entry.output || 'No output recorded.'}</p>{entry.blocker && <p className="mt-1 text-xs text-amber-700">Blocker: {entry.blocker}</p>}</div>)}<div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>Status: {row.dpr.status}</span><span>Quality: {row.dpr.qualityScore ?? '-'}</span><span>AI completion: {row.dpr.aiCompletionPercent ?? 'Pending'}%</span></div></div>}</section>
                    </div>}
                  </div>;
                })}
              </div>}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit employee DPR · {editing?.row?.employee?.firstName} {editing?.row?.employee?.lastName}</DialogTitle></DialogHeader>
          {editing && <div className="space-y-4">
            <p className="text-xs text-muted-foreground">HR can correct the submitted DPR here. The change is recorded in the DPR audit trail.</p>
            {editing.entries.map((entry:any) => <div key={entry.id} className="rounded-xl border p-4 space-y-3">
              <div><Label>Task / description</Label><Input value={entry.description} onChange={(e) => updateEntry(entry.id,'description',e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Hours</Label><Input type="number" min="0" max="24" step="0.25" value={entry.hours} onChange={(e) => updateEntry(entry.id,'hours',e.target.value)} /></div>
                <div><Label>Project</Label><Input value={entry.project} onChange={(e) => updateEntry(entry.id,'project',e.target.value)} /></div>
              </div>
              <div><Label>What was delivered?</Label><Textarea value={entry.output} onChange={(e) => updateEntry(entry.id,'output',e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2"><div><Label>Blocker / reason</Label><Textarea value={entry.blocker} onChange={(e) => updateEntry(entry.id,'blocker',e.target.value)} /></div><div><Label>Tomorrow&apos;s plan</Label><Textarea value={entry.tomorrowPlan} onChange={(e) => updateEntry(entry.id,'tomorrowPlan',e.target.value)} /></div></div>
            </div>)}
            <div className="rounded-lg bg-muted/40 p-3 text-sm font-medium">Total: {editing.entries.reduce((sum:number,e:any)=>sum+Number(e.hours||0),0).toFixed(2)}h</div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={saveHrEdit} disabled={saving}>{saving ? 'Saving...' : 'Save HR Changes'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Info({label,value}:{label:string;value:string}) { return <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
