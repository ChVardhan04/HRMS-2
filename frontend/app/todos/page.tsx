'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ListChecks } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { TodayTodoList } from '@/components/todos/today-todo-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api-client';
import { getTodoProof } from '@/features/todos/use-todos';
import { Button } from '@/components/ui/button';

function HrEodMonitor() {
  const { data, isLoading } = useQuery({ queryKey: ['todos', 'eod-monitor'], queryFn: () => api.get<any[]>('/todos/eod-monitor'), refetchInterval: 60000 });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /> EOD task evidence monitor</CardTitle><p className="text-xs text-muted-foreground">HR can review whether employees resolved their tasks, the AI completion estimate and the supporting evidence.</p></CardHeader>
      <CardContent>{isLoading ? <div className="h-32 animate-pulse rounded-md bg-muted" /> : <div className="space-y-3">{data?.map((row: any) => <div key={row.employee.id} className="rounded-xl border p-4"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><p className="font-medium">{row.employee.firstName} {row.employee.lastName}</p><p className="text-xs text-muted-foreground">{row.employee.employeeCode} · {row.employee.department?.name ?? 'No department'}</p></div><div className="flex flex-wrap gap-2"><Badge variant={row.pendingTasks ? 'destructive' : 'success'}>{row.pendingTasks ? `${row.pendingTasks} pending` : 'All resolved'}</Badge><Badge variant="outline">AI {row.aiCompletionPercent == null ? 'Pending' : `${row.aiCompletionPercent}%`}</Badge></div></div><div className="mt-3 grid gap-2 md:grid-cols-2">{row.tasks.map((task: any) => <div key={task.id} className="rounded-lg bg-muted/40 p-3 text-sm"><div className="flex items-center justify-between gap-2"><span>{task.title}</span>{task.eodStatus === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : task.eodStatus === 'INCOMPLETE' ? <AlertCircle className="h-4 w-4 text-amber-600" /> : <span className="text-xs text-muted-foreground">Pending</span>}</div>{task.aiCompletionPercent != null && <p className="mt-1 text-xs text-muted-foreground">AI completion: {Number(task.aiCompletionPercent).toFixed(0)}%</p>}{task.incompleteReason && <p className="mt-1 text-xs text-amber-700">Reason: {task.incompleteReason}</p>}{task.completionProofFileName && <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>Proof: {task.completionProofFileName}</span><Button size="sm" variant="ghost" onClick={async () => { const result = await getTodoProof(task.id); window.open(result.url, '_blank', 'noopener,noreferrer'); }}>View</Button></div>}</div>)}</div></div>)}</div>}</CardContent>
    </Card>
  );
}

export default function TodosPage() {
  const isHr = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  return <AppShell title="To-Dos"><div className="mx-auto w-full max-w-6xl space-y-4"><TodayTodoList />{isHr && <HrEodMonitor />}</div></AppShell>;
}
