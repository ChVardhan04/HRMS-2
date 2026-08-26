'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ListChecks,
  Plus,
  Upload,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/empty-state';
import {
  useResolveTodo,
  useCreateTodo,
  useTodayTodos,
  getTodoProof,
  useTodoEodStatus,
} from '@/features/todos/use-todos';
import { useTodayWorkDay } from '@/features/workday/use-workday';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function TodayTodoList() {
  const { data: todos, isLoading } = useTodayTodos();
  const { data: workDay } = useTodayWorkDay();
  const { data: eod } = useTodoEodStatus();
  const createTodo = useCreateTodo();
  const resolveTodo = useResolveTodo();
  const isManager = useAuthStore((s) => s.hasRole('MANAGER'));
  const { toast } = useToast();

  const { data: team } = useQuery({
    queryKey: ['employees', 'todo-assignees'],
    queryFn: () => api.get<any[]>('/employees/my-reports'),
    enabled: isManager,
  });

  const [newTitle, setNewTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('self');
  const [selected, setSelected] = useState<any | null>(null);
  const [hours, setHours] = useState('1');
  const [output, setOutput] = useState('');
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<File | undefined>();

  const checkedIn = !!workDay?.checkInAt;

  async function openProof(todo: any) {
    try {
      const result = await getTodoProof(todo.id);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast({
        title: 'Could not open proof',
        description: e.message,
        variant: 'destructive',
      });
    }
  }

  function resetResolution() {
    setSelected(null);
    setHours('1');
    setOutput('');
    setReason('');
    setProof(undefined);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" /> Today&apos;s To-Dos
          </CardTitle>

          <p className="mt-1 text-xs text-muted-foreground">
            Resolve every task before checkout. Completed tasks require
            screenshot proof; incomplete tasks require a valid reason.
          </p>
        </div>

        {checkedIn && (
          <Badge variant={eod?.pending ? 'destructive' : 'success'}>
            {eod?.pending ?? 0} pending EOD
          </Badge>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!checkedIn ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Check in first. Your WorkDay check-in unlocks today&apos;s task
            workflow.
          </div>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTitle.trim()) return;

              createTodo.mutate(
                {
                  title: newTitle.trim(),
                  dueDate: new Date().toISOString(),
                  assigneeId:
                    assigneeId === 'self' ? undefined : assigneeId,
                },
                {
                  onSuccess: () => setNewTitle(''),
                },
              );
            }}
          >
            <div className="flex gap-2">
              <Input
                placeholder={
                  isManager
                    ? 'Add a personal task or assign one...'
                    : 'Add a personal task for today...'
                }
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />

              <Button
                type="submit"
                size="icon"
                variant="secondary"
                disabled={createTodo.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {isManager && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">
                  Assign to
                </Label>

                <Select
                  value={assigneeId}
                  onValueChange={setAssigneeId}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="self">Myself</SelectItem>

                    {team?.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.firstName} {e.lastName} · {e.employeeCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form>
        )}

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        ) : checkedIn && !todos?.length ? (
          <EmptyState
            icon={ListChecks}
            title="No tasks yet"
            description="Add a personal task or wait for your manager to assign one."
          />
        ) : checkedIn ? (
          <div className="flex flex-col divide-y divide-border">
            {todos.map((todo: any) => (
              <div
                key={todo.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <button
                  onClick={() =>
                    todo.eodStatus === 'PENDING'
                      ? setSelected(todo)
                      : undefined
                  }
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  {todo.eodStatus === 'COMPLETED' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  ) : todo.eodStatus === 'INCOMPLETE' ? (
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}

                  <span
                    className={
                      todo.eodStatus === 'COMPLETED'
                        ? 'text-sm line-through text-muted-foreground'
                        : 'text-sm'
                    }
                  >
                    {todo.title}
                  </span>
                </button>

                <div className="flex items-center gap-2">
                  {todo.aiCompletionPercent != null && (
                    <Badge variant="outline">
                      AI {Number(todo.aiCompletionPercent).toFixed(0)}%
                    </Badge>
                  )}

                  {todo.completionProofStorageKey && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openProof(todo)}
                      title="View proof"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}

                  <Badge variant="outline">{todo.priority}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {selected && (
          <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
            <div>
              <p className="font-medium">
                EOD update: {selected.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose how the task ended today.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Hours spent</Label>
                <Input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>

              <div>
                <Label>Outcome</Label>

                <Select
                  defaultValue="COMPLETED"
                  onValueChange={(v) => {
                    if (v === 'COMPLETED') {
                      setReason('');
                    } else {
                      setProof(undefined);
                    }

                    setSelected({
                      ...selected,
                      selectedOutcome: v,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="COMPLETED">
                      Completed
                    </SelectItem>
                    <SelectItem value="INCOMPLETE">
                      Incomplete
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(selected.selectedOutcome ?? 'COMPLETED') ===
            'COMPLETED' ? (
              <>
                <div>
                  <Label>Completion summary</Label>
                  <Textarea
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                    placeholder="What was delivered?"
                  />
                </div>

                <div>
                  <Label>Screenshot proof</Label>

                  <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm">
                    <Upload className="h-4 w-4" />
                    {proof?.name ?? 'Upload PNG, JPG or WEBP screenshot'}

                    <input
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) =>
                        setProof(e.target.files?.[0])
                      }
                    />
                  </label>
                </div>
              </>
            ) : (
              <div>
                <Label>Valid reason for incomplete task</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain the blocker, dependency or reason it could not be completed."
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                disabled={resolveTodo.isPending}
                onClick={() =>
                  resolveTodo.mutate(
                    {
                      id: selected.id,
                      outcome:
                        selected.selectedOutcome ?? 'COMPLETED',
                      actualHours: Number(hours),
                      outputSummary: output,
                      incompleteReason: reason,
                      proof,
                    },
                    {
                      onSuccess: resetResolution,
                    },
                  )
                }
              >
                Save EOD update
              </Button>

              <Button variant="ghost" onClick={resetResolution}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
