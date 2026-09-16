'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { TodayDprCard } from '@/components/dpr/today-dpr-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api-client';
import { usePendingReviews, useReviewDpr, useTeamDprStatus } from '@/features/dpr/use-dpr';
import { getTodoProof } from '@/features/todos/use-todos';
import { ClipboardCheck, Eye, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function DprPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const isManagerOrAbove = hasRole('MANAGER', 'SUPER_ADMIN');
  const { data: pending, isLoading: pendingLoading } = usePendingReviews();
  const { data: teamStatus } = useTeamDprStatus(isManagerOrAbove);
  const review = useReviewDpr();
  const { toast } = useToast();
  const [selected, setSelected] = useState<any | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | 'request-changes'>('approve');
  const [comment, setComment] = useState('');
  const [qualityScore, setQualityScore] = useState('8');

  function openReview(dpr: any, nextDecision: 'approve' | 'reject' | 'request-changes' = 'approve') {
    setSelected(dpr);
    setDecision(nextDecision);
    setComment('');
    setQualityScore(dpr.qualityScore != null ? String(dpr.qualityScore) : '8');
  }

  const canReviewSelected = Boolean(selected && ['SUBMITTED', 'UNDER_REVIEW'].includes(selected.status));

  function submitReview() {
    if (!selected) return;
    if ((decision === 'request-changes' || decision === 'reject') && !comment.trim()) {
      toast({ title: 'Comment required', description: 'Explain what needs to change before sending the DPR back.', variant: 'destructive' });
      return;
    }
    review.mutate(
      {
        dprId: selected.id,
        decision,
        comment: comment.trim() || undefined,
        qualityScore: Number(qualityScore),
      },
      {
        onSuccess: () => setSelected(null),
      },
    );
  }

  async function openTeamDpr(workDayId: string) {
    try {
      const dpr = await api.get<any>(`/dpr/work-day/${workDayId}`);
      setSelected(dpr);
      setDecision('approve');
      setComment('');
      setQualityScore(dpr.qualityScore != null ? String(dpr.qualityScore) : '8');
    } catch (error: any) {
      toast({ title: 'Could not open DPR', description: error.message, variant: 'destructive' });
    }
  }

  async function openProof(task: any) {
    try {
      const result = await getTodoProof(task.id);
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast({ title: 'Could not open proof', description: error.message, variant: 'destructive' });
    }
  }

  return (
    <AppShell title="Daily Progress Report">
      <div className="flex flex-col gap-4">
        <div className="mx-auto w-full max-w-4xl">
          <TodayDprCard />
        </div>

        {isManagerOrAbove && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" /> Team DPR status
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  See every direct report&apos;s current DPR state and AI task-completion score.
                </p>
              </CardHeader>
              <CardContent>
                {!teamStatus?.length ? (
                  <EmptyState icon={ClipboardCheck} title="No team members found" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="px-2 py-2">Employee</th>
                          <th className="px-2 py-2">Attendance</th>
                          <th className="px-2 py-2">DPR</th>
                          <th className="px-2 py-2">AI score</th>
                          <th className="px-2 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamStatus.map((row: any) => (
                          <tr key={row.employee.id} className="border-b last:border-0">
                            <td className="px-2 py-3">
                              <p className="font-medium">{row.employee.firstName} {row.employee.lastName}</p>
                              <p className="text-xs text-muted-foreground">{row.employee.employeeCode}</p>
                            </td>
                            <td className="px-2 py-3"><StatusBadge status={row.attendanceStatus} /></td>
                            <td className="px-2 py-3"><StatusBadge status={row.dprStatus} /></td>
                            <td className="px-2 py-3">{row.aiSummary?.score == null ? '-' : `${Number(row.aiSummary.score).toFixed(0)}%`}</td>
                            <td className="px-2 py-3 text-right">
                              {row.workDayId ? (
                                <Button size="sm" variant="outline" onClick={() => openTeamDpr(row.workDayId)}>
                                  View
                                </Button>
                              ) : <span className="text-xs text-muted-foreground">No DPR yet</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" /> Pending team reviews
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingLoading ? (
                  <div className="h-24 animate-pulse rounded-md bg-muted" />
                ) : !pending?.length ? (
                  <EmptyState icon={ClipboardCheck} title="Nothing to review" />
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {pending.map((dpr: any) => (
                      <div key={dpr.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-medium">{dpr.workDay.employee.firstName} {dpr.workDay.employee.lastName}</p>
                          <p className="text-xs text-muted-foreground">{dpr.workDay.date?.slice(0, 10)} · {dpr.entries.length} task entries</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <StatusBadge status={dpr.status} />
                            <Badge variant="outline"><Sparkles className="mr-1 h-3 w-3" /> AI {dpr.aiSummary?.score == null ? 'Pending' : `${Number(dpr.aiSummary.score).toFixed(0)}%`}</Badge>
                          </div>
                        </div>
                        <Button size="sm" onClick={() => openReview(dpr)}>Review DPR</Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review DPR</DialogTitle>
            <DialogDescription>
              Review the employee&apos;s submitted tasks, DPR evidence and AI analysis before deciding.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{selected.workDay.employee.firstName} {selected.workDay.employee.lastName}</p>
                  <p className="text-xs text-muted-foreground">{selected.workDay.date?.slice(0, 10)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={selected.status} />
                  <Badge variant="outline">AI {selected.aiSummary?.score == null ? 'Pending' : `${Number(selected.aiSummary.score).toFixed(0)}%`}</Badge>
                  {selected.aiSummary?.provider && <Badge variant="muted">{selected.aiSummary.provider === 'heuristic-fallback' ? 'Fallback analysis' : 'AI analysis'}</Badge>}
                </div>
              </div>

              <div className="space-y-3">
                {selected.entries.map((entry: any) => {
                  const task = entry.todo;
                  const analysis = task?.aiCompletionAnalysis as any;
                  return (
                    <div key={entry.id} className="rounded-xl border p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-medium">{entry.description}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Logged hours: {Number(entry.hours).toFixed(1)}h</p>
                        </div>
                        {task?.aiCompletionPercent != null && <Badge variant="outline">AI {Number(task.aiCompletionPercent).toFixed(0)}%</Badge>}
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Employee output</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm">{entry.output || 'No output summary provided.'}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="text-xs font-medium text-muted-foreground">Blocker / reason</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm">{entry.blocker || task?.incompleteReason || 'None reported.'}</p>
                        </div>
                      </div>
                      {analysis && (
                        <div className="mt-3 rounded-md border border-primary/10 bg-primary/5 p-3 text-xs">
                          <p className="font-medium">AI analysis</p>
                          <p className="mt-1">{analysis.summary}</p>
                          {analysis.gaps && <p className="mt-1 text-muted-foreground">Gaps: {analysis.gaps}</p>}
                        </div>
                      )}
                      {task?.completionProofFileName && (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border p-2">
                          <span className="truncate text-xs text-muted-foreground">Proof: {task.completionProofFileName}</span>
                          <Button size="sm" variant="ghost" onClick={() => openProof(task)}><Eye className="mr-1 h-3.5 w-3.5" /> View proof</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {canReviewSelected ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Manager quality score (0-10)</Label>
                      <Input type="number" min="0" max="10" step="0.5" value={qualityScore} onChange={(e) => setQualityScore(e.target.value)} />
                    </div>
                    <div>
                      <Label>Decision</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant={decision === 'approve' ? 'default' : 'outline'} onClick={() => setDecision('approve')}>Approve</Button>
                        <Button size="sm" variant={decision === 'request-changes' ? 'default' : 'outline'} onClick={() => setDecision('request-changes')}>Request changes</Button>
                        <Button size="sm" variant={decision === 'reject' ? 'destructive' : 'outline'} onClick={() => setDecision('reject')}>Reject</Button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Review comment {decision !== 'approve' && <span className="text-destructive">*</span>}</Label>
                    <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={decision === 'approve' ? 'Optional feedback for the employee.' : 'Explain what needs to be corrected.'} />
                  </div>
                </>
              ) : (
                <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                  This DPR is not currently awaiting review. You can view its contents here, but no review action is available.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            {canReviewSelected && (
              <Button onClick={submitReview} disabled={review.isPending}>{review.isPending ? 'Saving review...' : decision === 'approve' ? 'Approve DPR' : decision === 'request-changes' ? 'Request changes' : 'Reject DPR'}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
