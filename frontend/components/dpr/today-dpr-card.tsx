'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, Save, Send, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useTodayWorkDay } from '@/features/workday/use-workday';
import { useDpr, useSaveDprDraft, useSubmitDpr } from '@/features/dpr/use-dpr';

const EDITABLE_STATUSES = new Set(['DRAFT', 'NEEDS_CHANGES', 'REJECTED']);

function formatAiProvider(provider: string | null | undefined) {
  if (!provider) return 'Not analysed';
  if (provider === 'heuristic-fallback') return 'Fallback analysis';
  if (provider === 'mixed') return 'Mixed analysis';
  return 'AI analysis';
}

export function TodayDprCard() {
  const { data: workDay } = useTodayWorkDay();
  const { data: dpr, isLoading } = useDpr(workDay?.id);
  const saveDraft = useSaveDprDraft();
  const submitDpr = useSubmitDpr();
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    if (!dpr?.entries) return;
    setEntries(
      dpr.entries.map((entry: any) => ({
        ...entry,
        hours: Number(entry.hours ?? 0),
        output: entry.output ?? '',
        blocker: entry.blocker ?? '',
        tomorrowPlan: entry.tomorrowPlan ?? '',
      })),
    );
  }, [dpr?.id, dpr?.updatedAt, dpr?.entries]);

  const editable = Boolean(dpr && EDITABLE_STATUSES.has(dpr.status));
  const totalHours = useMemo(
    () => entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    [entries],
  );
  const aiScore = dpr?.aiSummary?.score;

  function updateEntry(id: string, field: string, value: string) {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    );
  }

  function save() {
    if (!workDay?.id) return;
    saveDraft.mutate({
      workDayId: workDay.id,
      entries: entries.map((entry) => ({
        id: entry.id,
        todoId: entry.todoId ?? undefined,
        project: entry.project ?? undefined,
        description: entry.description,
        hours: Number(entry.hours),
        output: entry.output || undefined,
        blocker: entry.blocker || undefined,
        tomorrowPlan: entry.tomorrowPlan || undefined,
      })),
    });
  }

  function submit() {
    if (!workDay?.id) return;
    if (!entries.length) return;

    const payload = {
      workDayId: workDay.id,
      entries: entries.map((entry) => ({
        id: entry.id,
        todoId: entry.todoId ?? undefined,
        project: entry.project ?? undefined,
        description: entry.description,
        hours: Number(entry.hours),
        output: entry.output || undefined,
        blocker: entry.blocker || undefined,
        tomorrowPlan: entry.tomorrowPlan || undefined,
      })),
    };

    saveDraft.mutate(payload, {
      onSuccess: () => submitDpr.mutate(workDay.id),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Today's DPR
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            One DPR per working day. All resolved To-Dos are automatically included.
          </p>
        </div>
        {dpr && <StatusBadge status={dpr.status} />}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        ) : !dpr ? (
          <EmptyState icon={FileText} title="DPR not available" />
        ) : (
          <div className="space-y-4">
            {dpr.status === 'NEEDS_CHANGES' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Your manager requested changes.</p>
                {dpr.reviewComment && <p className="mt-1">{dpr.reviewComment}</p>}
                <p className="mt-1 text-xs">Edit the report below and re-submit it for review.</p>
              </div>
            )}

            {dpr.status === 'REJECTED' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-medium">Your DPR was rejected.</p>
                {dpr.reviewComment && <p className="mt-1">{dpr.reviewComment}</p>}
                <p className="mt-1 text-xs">Correct the report and submit it again.</p>
              </div>
            )}

            {dpr.hasMismatchFlag && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{dpr.mismatchNotes}</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">DPR hours</p>
                <p className="mt-1 text-lg font-semibold">{totalHours.toFixed(1)}h</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Tasks in DPR</p>
                <p className="mt-1 text-lg font-semibold">{entries.length}</p>
              </div>
              <div className="rounded-lg bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">AI completion score</p>
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <p className="mt-1 text-lg font-semibold">{aiScore == null ? 'Pending' : `${Number(aiScore).toFixed(0)}%`}</p>
                <p className="text-[11px] text-muted-foreground">{formatAiProvider(dpr.aiSummary?.provider)}{dpr.aiSummary?.confidence != null ? ` · ${dpr.aiSummary.confidence}% confidence` : ''}</p>
              </div>
            </div>

            {!entries.length ? (
              <EmptyState icon={FileText} title="No To-Do entries yet" description="Resolve today's To-Dos first. They will automatically appear here." />
            ) : (
              <div className="space-y-3">
                {entries.map((entry: any, index: number) => {
                  const task = entry.todo;
                  const taskScore = task?.aiCompletionPercent;
                  return (
                    <div key={entry.id} className="rounded-xl border p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{index + 1}. {entry.description}</p>
                            {task && <Badge variant="outline">{task.eodStatus === 'COMPLETED' ? 'Completed' : 'Incomplete'}</Badge>}
                          </div>
                          {task?.incompleteReason && <p className="mt-1 text-xs text-amber-700">Incomplete reason: {task.incompleteReason}</p>}
                        </div>
                        {taskScore != null && <Badge variant="outline">AI {Number(taskScore).toFixed(0)}%</Badge>}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>Hours</Label>
                          <Input
                            type="number"
                            min="0.25"
                            max="24"
                            step="0.25"
                            value={entry.hours}
                            disabled={!editable}
                            onChange={(event) => updateEntry(entry.id, 'hours', event.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Project</Label>
                          <Input value={entry.project ?? ''} disabled placeholder="Project" />
                        </div>
                        <div className="md:col-span-2">
                          <Label>What was delivered?</Label>
                          <Textarea
                            value={entry.output}
                            disabled={!editable}
                            onChange={(event) => updateEntry(entry.id, 'output', event.target.value)}
                            placeholder="Summarize the actual work completed."
                          />
                        </div>
                        <div>
                          <Label>Blocker / incomplete details</Label>
                          <Textarea
                            value={entry.blocker}
                            disabled={!editable}
                            onChange={(event) => updateEntry(entry.id, 'blocker', event.target.value)}
                            placeholder="Mention blockers if any."
                          />
                        </div>
                        <div>
                          <Label>Tomorrow's plan</Label>
                          <Textarea
                            value={entry.tomorrowPlan}
                            disabled={!editable}
                            onChange={(event) => updateEntry(entry.id, 'tomorrowPlan', event.target.value)}
                            placeholder="What should continue tomorrow?"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {dpr.auditTrail?.length > 0 && (
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-medium">Latest review activity</p>
                <div className="mt-2 space-y-1">
                  {dpr.auditTrail.slice(0, 3).map((item: any) => (
                    <p key={item.id} className="text-xs text-muted-foreground">
                      {item.action.replace(/_/g, ' ')} · {new Date(item.createdAt).toLocaleString('en-IN')}
                      {item.detail ? ` · ${item.detail}` : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              {editable && (
                <Button variant="outline" onClick={save} disabled={saveDraft.isPending || !entries.length}>
                  <Save className="h-4 w-4" /> {saveDraft.isPending ? 'Saving...' : 'Save draft'}
                </Button>
              )}
              {editable && (
                <Button onClick={submit} disabled={submitDpr.isPending || saveDraft.isPending || !entries.length}>
                  <Send className="h-4 w-4" /> {submitDpr.isPending ? 'Submitting...' : dpr.status === 'NEEDS_CHANGES' || dpr.status === 'REJECTED' ? 'Re-submit DPR' : 'Submit DPR'}
                </Button>
              )}
            </div>

            {!editable && dpr.status !== 'APPROVED' && (
              <p className="text-xs text-muted-foreground">
                This DPR is currently under manager review. You can edit it again if your manager requests changes.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
