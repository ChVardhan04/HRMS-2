'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BrainCircuit, CheckCircle2, Clock3, Plus, Save, Target, WandSparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { KraSummaryCard } from '@/components/kra/kra-summary-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useAuthStore } from '@/lib/auth-store';
import { useKraTemplates, useMyKraTemplate, useTeamKraScores, useConfigureKraTemplate, useCalculateKra, useMyKraCommitments, useCreateKraCommitment, useUpdateKraCommitment, useTeamKraCommitments } from '@/features/kra/use-kra';
import { useDepartments, useDepartment } from '@/features/departments/use-departments';
import { useToast } from '@/hooks/use-toast';

function previousPeriod(month: number, year: number, monthsBack = 1) {
  const d = new Date(year, month - 1 - monthsBack, 1);
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

export default function KraPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const isHr = hasRole('HR_ADMIN', 'SUPER_ADMIN');
  const canViewTeam = hasRole('MANAGER', 'HR_ADMIN', 'SUPER_ADMIN');
  const now = new Date();
  const [month] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const [reviewPeriod] = useState(() =>
    previousPeriod(
      now.getMonth() + 1,
      now.getFullYear(),
      now.getDate() >= 7 ? 1 : 2
    )
  );
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: team } = useTeamKraScores(
    reviewPeriod.month,
    reviewPeriod.year,
    canViewTeam
  );
  const { data: myTemplate } = useMyKraTemplate();
  const { data: myCommitments } = useMyKraCommitments(month, year);
  const { data: teamCommitments } = useTeamKraCommitments(
    month,
    year,
    canViewTeam
  );
  const { data: departments } = useDepartments();

  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [roleProfile, setRoleProfile] = useState('');
  const [commitmentOpen, setCommitmentOpen] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<any | null>(null);
  const [commitmentForm, setCommitmentForm] = useState({
    metricId: 'auto',
    title: '',
    description: '',
    targetValue: '',
    targetUnit: '',
    completionPercent: '0',
    employeeNote: '',
    evidence: '',
  });

  const { data: selectedDepartment } = useDepartment(
    departmentId,
    month,
    year
  );
  const { data: templates } = useKraTemplates(departmentId, isHr);
  const configure = useConfigureKraTemplate();
  const calculateKra = useCalculateKra();
  const createCommitment = useCreateKraCommitment();
  const updateCommitment = useUpdateKraCommitment();

  const designations = selectedDepartment?.designations ?? [];
  const selectedDesignation = designations.find(
    (d: any) => d.id === designationId
  );
  const existingTemplate = useMemo(
    () => templates?.find((t: any) => t.designationId === designationId),
    [templates, designationId]
  );

  const currentMonthName = now.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const reviewMonthName = new Date(
    reviewPeriod.year,
    reviewPeriod.month - 1,
    1
  ).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const deadline = new Date(year, month, 0).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  useEffect(() => {
    if (!departmentId && departments?.[0]?.id) {
      setDepartmentId(departments[0].id);
    }
  }, [departments, departmentId]);

  useEffect(() => {
    if (
      designations.length &&
      !designations.some((d: any) => d.id === designationId)
    ) {
      setDesignationId(designations[0].id);
    }

    if (!designations.length) {
      setDesignationId('');
    }
  }, [designations, designationId]);

  useEffect(() => {
    if (existingTemplate?.description) {
      setRoleProfile(existingTemplate.description);
    } else if (selectedDesignation?.title && !roleProfile) {
      setRoleProfile(
        `Define the day-to-day responsibilities, expected outputs, quality standards and measurable KPIs for ${selectedDesignation.title}.`
      );
    }
  }, [existingTemplate, selectedDesignation]);

  const openNewCommitment = () => {
    setEditingCommitment(null);
    setCommitmentForm({
      metricId: 'auto',
      title: '',
      description: '',
      targetValue: '',
      targetUnit: '',
      completionPercent: '0',
      employeeNote: '',
      evidence: '',
    });
    setCommitmentOpen(true);
  };

  const openEditCommitment = (c: any) => {
    setEditingCommitment(c);
    setCommitmentForm({
      metricId: c.metricId ?? 'auto',
      title: c.title ?? '',
      description: c.description ?? '',
      targetValue: c.targetValue == null ? '' : String(c.targetValue),
      targetUnit: c.targetUnit ?? '',
      completionPercent: String(c.completionPercent ?? 0),
      employeeNote: c.employeeNote ?? '',
      evidence: c.evidence ?? '',
    });
    setCommitmentOpen(true);
  };

  const saveCommitment = () => {
    if (!commitmentForm.title.trim()) return;

    const payload: any = {
      title: commitmentForm.title.trim(),
      metricId:
        commitmentForm.metricId === 'auto'
          ? undefined
          : commitmentForm.metricId,
      description: commitmentForm.description.trim() || undefined,
      targetValue: commitmentForm.targetValue
        ? Number(commitmentForm.targetValue)
        : undefined,
      targetUnit: commitmentForm.targetUnit.trim() || undefined,
    };

    if (editingCommitment) {
      updateCommitment.mutate(
        {
          id: editingCommitment.id,
          ...payload,
          completionPercent:
            Number(commitmentForm.completionPercent) || 0,
          employeeNote:
            commitmentForm.employeeNote.trim() || undefined,
          evidence: commitmentForm.evidence.trim() || undefined,
        },
        {
          onSuccess: (result: any) => {
            setCommitmentOpen(false);
            qc.invalidateQueries({ queryKey: ['kra', 'commitments'] });
            toast({
              title:
                result.alignmentStatus === 'NOT_MATCHED'
                  ? 'Commitment saved, but it is not aligned'
                  : 'Commitment updated',
              description: result.alignmentReason,
              variant:
                result.alignmentStatus === 'NOT_MATCHED'
                  ? 'destructive'
                  : 'success',
            });
          },
          onError: (e: any) =>
            toast({
              title: 'Could not update commitment',
              description: e.message,
              variant: 'destructive',
            }),
        }
      );
    } else {
      createCommitment.mutate(payload, {
        onSuccess: (result: any) => {
          setCommitmentOpen(false);
          qc.invalidateQueries({ queryKey: ['kra', 'commitments'] });
          toast({
            title:
              result.alignmentStatus === 'NOT_MATCHED'
                ? 'Commitment saved, but it is not aligned'
                : 'Monthly commitment added',
            description: result.alignmentReason,
            variant:
              result.alignmentStatus === 'NOT_MATCHED'
                ? 'destructive'
                : 'success',
          });
        },
        onError: (e: any) =>
          toast({
            title: 'Could not add commitment',
            description: e.message,
            variant: 'destructive',
          }),
      });
    }
  };

  const saveGenerated = () => {
    if (
      !departmentId ||
      !designationId ||
      !selectedDesignation ||
      !roleProfile.trim()
    ) {
      return;
    }

    configure.mutate(
      {
        departmentId,
        designationId,
        roleName: selectedDesignation.title,
        roleProfile: roleProfile.trim(),
      },
      {
        onSuccess: (result: any) => {
          qc.invalidateQueries({ queryKey: ['kra'] });
          toast({
            title: 'KRA configuration saved',
            description: `${
              result.items?.length ?? 0
            } result-driven metrics are now attached to ${selectedDesignation.title}.`,
            variant: 'success',
          });
        },
        onError: (e: any) =>
          toast({
            title: 'Could not configure KRA',
            description: e.message,
            variant: 'destructive',
          }),
      }
    );
  };

  return (
    <AppShell title="KRA & Performance">
      <div className="space-y-5">
        <div className="mx-auto w-full max-w-xl">
          <KraSummaryCard />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              My designation KRA expectations
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These are the result-driven company metrics saved by HR for your
              current department and designation.
            </p>
          </CardHeader>

          <CardContent>
            {!myTemplate?.items?.length ? (
              <div className="rounded-xl border border-dashed p-5">
                <p className="font-medium">No KRA is configured yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  HR must configure measurable result-driven metrics for your
                  designation before you can align monthly commitments.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Weight</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {myTemplate.items.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <p className="font-medium">{i.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.description}
                          </p>
                        </TableCell>
                        <TableCell>
                          {i.targetText ??
                            (i.targetValue != null
                              ? `${i.targetValue} ${i.unit ?? ''}`
                              : 'Not specified')}
                        </TableCell>
                        <TableCell>
                          {Number(i.weightPercent).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                My monthly commitments · {currentMonthName}
              </CardTitle>

              <p className="mt-1 text-sm text-muted-foreground">
                Commitments are your expected results for this month. Every
                commitment should map to a saved KRA metric.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">
                  <Clock3 className="mr-1 h-3 w-3" />
                  Deadline: {deadline}
                </Badge>
                <Badge variant="secondary">Final KRA: 7th of next month</Badge>
              </div>
            </div>

            <Button
              onClick={openNewCommitment}
              disabled={!myTemplate?.items?.length}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add commitment
            </Button>
          </CardHeader>

          <CardContent>
            {!myCommitments?.length ? (
              <EmptyState
                icon={Target}
                title="No commitments yet"
                description="Add measurable results for this month. The system checks alignment with your designation KRA after saving."
              />
            ) : (
              <div className="space-y-3">
                {myCommitments.map((c: any) => {
                  const bad =
                    c.alignmentStatus === 'NOT_MATCHED' ||
                    c.alignmentStatus === 'UNMATCHED';
                  const partial = c.alignmentStatus === 'PARTIAL';

                  return (
                    <div
                      key={c.id}
                      className={`rounded-xl border p-4 ${
                        bad
                          ? 'border-destructive/60 bg-destructive/5'
                          : partial
                            ? 'border-warning/50 bg-warning/5'
                            : 'border-border'
                      }`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{c.title}</p>

                            <Badge
                              variant={
                                c.status === 'COMPLETED'
                                  ? 'success'
                                  : c.status === 'PARTIAL'
                                    ? 'warning'
                                    : 'outline'
                              }
                            >
                              {c.status}
                            </Badge>

                            {bad ? (
                              <Badge variant="destructive">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                Not aligned
                              </Badge>
                            ) : partial ? (
                              <Badge variant="warning">
                                Partially aligned
                              </Badge>
                            ) : (
                              <Badge variant="success">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Aligned
                              </Badge>
                            )}
                          </div>

                          {c.description && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {c.description}
                            </p>
                          )}

                          <p className="mt-2 text-xs text-muted-foreground">
                            Target: {c.targetValue ?? '—'}{' '}
                            {c.targetUnit ?? ''} · Deadline: {deadline}
                          </p>

                          <p className="mt-1 text-xs">
                            <span className="font-medium">
                              Expected metric:
                            </span>{' '}
                            {c.metric?.name ?? 'No metric selected'}
                          </p>

                          {(bad || partial) && (
                            <p className="mt-2 text-sm font-medium text-destructive">
                              {c.alignmentReason}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {Number(c.completionPercent).toFixed(0)}%
                          </span>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditCommitment(c)}
                          >
                            Update
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, Number(c.completionPercent))
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {canViewTeam && (
          <Card>
            <CardHeader>
              <CardTitle>Team commitments</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manager/HR view of employee-declared monthly results and
                whether they align with the employee&apos;s saved designation
                metrics.
              </p>
            </CardHeader>

            <CardContent>
              {!teamCommitments?.length ? (
                <p className="text-sm text-muted-foreground">
                  No team commitments submitted for this month.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Commitment</TableHead>
                        <TableHead>Expected metric</TableHead>
                        <TableHead>Completion</TableHead>
                        <TableHead>Alignment</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {teamCommitments.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <p className="font-medium">
                              {c.employee.firstName} {c.employee.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {c.employee.employeeCode}
                            </p>
                          </TableCell>
                          <TableCell>{c.title}</TableCell>
                          <TableCell>{c.metric?.name ?? '—'}</TableCell>
                          <TableCell className="font-medium">
                            {Number(c.completionPercent).toFixed(0)}%
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                c.alignmentStatus === 'MATCHED'
                                  ? 'success'
                                  : c.alignmentStatus === 'PARTIAL'
                                    ? 'warning'
                                    : 'destructive'
                              }
                            >
                              {c.alignmentStatus === 'MATCHED'
                                ? 'Aligned'
                                : c.alignmentStatus === 'PARTIAL'
                                  ? 'Partial'
                                  : 'Not aligned'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canViewTeam && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Latest final KRA · {reviewMonthName}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Monthly KRA is calculated and finalized automatically on the
                7th for the previous month.
              </p>
            </CardHeader>

            <CardContent>
              {!team?.length ? (
                <EmptyState
                  icon={Target}
                  title="No final KRA available"
                  description="The previous month will be scored on the 7th after the commitment period has closed."
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {team.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <p className="font-medium">
                              {s.employee.firstName} {s.employee.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {s.employee.employeeCode}
                            </p>
                          </TableCell>
                          <TableCell>
                            {s.employee.department?.name ?? '-'}
                          </TableCell>
                          <TableCell>
                            {s.employee.designation?.title ?? '-'}
                          </TableCell>
                          <TableCell className="font-medium">
                            {Number(s.finalScore).toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            {s.isFinal ? 'Final' : 'Preview'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isHr && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  KRA metric library & AI configuration
                </CardTitle>

                <p className="text-sm text-muted-foreground">
                  There are no automatic/default KRA metrics. HR must
                  configure the result-driven metrics for each department and
                  designation. For a new designation, enter the role scope and
                  AI generates measurable metrics, targets, weights and
                  evaluation guidance; HR reviews and saves them.
                </p>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Department</Label>
                    <Select
                      value={departmentId}
                      onValueChange={(v) => {
                        setDepartmentId(v);
                        setDesignationId('');
                        setRoleProfile('');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>

                      <SelectContent>
                        {departments?.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Designation</Label>
                    <Select
                      value={designationId}
                      onValueChange={setDesignationId}
                      disabled={!designations.length}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select designation" />
                      </SelectTrigger>

                      <SelectContent>
                        {designations.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Role profile / KPI input for AI</Label>
                  <Textarea
                    value={roleProfile}
                    onChange={(e) => setRoleProfile(e.target.value)}
                    rows={7}
                    placeholder="Describe responsibilities, expected outputs, quality standards and measurable targets."
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={saveGenerated}
                    disabled={
                      !departmentId ||
                      !designationId ||
                      !roleProfile.trim() ||
                      configure.isPending
                    }
                  >
                    <WandSparkles className="mr-1 h-4 w-4" />
                    {existingTemplate
                      ? 'Regenerate & Save KRA'
                      : 'Generate & Save KRA'}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() =>
                      calculateKra.mutate(
                        {
                          month: reviewPeriod.month,
                          year: reviewPeriod.year,
                        },
                        {
                          onSuccess: (result: any) => {
                            qc.invalidateQueries({ queryKey: ['kra'] });
                            toast({
                              title: 'KRA preview calculated',
                              description: `${result.calculated} employee(s) calculated for ${result.month}/${result.year}. This does not change the 7th-day finalization schedule.`,
                              variant: 'success',
                            });
                          },
                          onError: (e: any) =>
                            toast({
                              title: 'Could not calculate KRA preview',
                              description: e.message,
                              variant: 'destructive',
                            }),
                        }
                      )
                    }
                    disabled={calculateKra.isPending}
                  >
                    <Save className="mr-1 h-4 w-4" />
                    {calculateKra.isPending
                      ? 'Calculating...'
                      : 'Preview Previous Month'}
                  </Button>

                  {existingTemplate && (
                    <span className="text-sm text-muted-foreground">
                      {existingTemplate.items?.length ?? 0} saved metrics
                    </span>
                  )}
                </div>

                {existingTemplate?.items?.length ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Evidence</TableHead>
                          <TableHead>Evaluation</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {existingTemplate.items.map((i: any) => (
                          <TableRow key={i.id}>
                            <TableCell>
                              <p className="font-medium">{i.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {i.description}
                              </p>
                            </TableCell>
                            <TableCell>
                              {i.targetText ??
                                (i.targetValue != null
                                  ? `${i.targetValue} ${i.unit ?? ''}`
                                  : 'Not specified')}
                            </TableCell>
                            <TableCell>
                              {Number(i.weightPercent).toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-xs">
                              {i.evidenceSource}
                            </TableCell>
                            <TableCell className="max-w-sm text-xs">
                              {i.evaluationMethod}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No metrics saved for this designation. Configure them
                    before employees begin commitments.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Result-driven KRA workflow
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>1. HR configuration:</strong> HR creates and saves
                  the expected result metrics for every designation. No generic
                  default KRA is assigned automatically.
                </p>

                <p>
                  <strong>2. Employee commitment:</strong> During the month, the
                  employee records the results they commit to deliver and
                  aligns each commitment with a saved KRA metric.
                </p>

                <p>
                  <strong>3. Alignment check:</strong> After saving, the system
                  checks the commitment against the saved metric. A red warning
                  means the commitment is not aligned and should be corrected
                  before month end.
                </p>

                <p>
                  <strong>4. Month-end result:</strong> The employee has until
                  the last calendar day of the month to update completion
                  percentage, result notes and evidence. After month end, the
                  commitment period locks and a new month opens.
                </p>

                <p>
                  <strong>5. 7th-day evaluation:</strong> On the 7th of the
                  following month, AI compares the designation metrics with the
                  employee&apos;s aligned commitments/results and actual
                  Attendance, To-Dos, DPR and quality evidence, then calculates
                  the weighted final KRA.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={commitmentOpen} onOpenChange={setCommitmentOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingCommitment
                ? 'Update monthly commitment / result'
                : 'Add monthly commitment'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Expected KRA metric</Label>
              <Select
                value={commitmentForm.metricId}
                onValueChange={(v) =>
                  setCommitmentForm({
                    ...commitmentForm,
                    metricId: v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="auto">
                    Auto-detect from commitment
                  </SelectItem>

                  {myTemplate?.items?.map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} · {Number(i.weightPercent).toFixed(0)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Commitment</Label>
              <Input
                value={commitmentForm.title}
                onChange={(e) =>
                  setCommitmentForm({
                    ...commitmentForm,
                    title: e.target.value,
                  })
                }
                placeholder="Example: Complete 40 keyword research tasks"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={commitmentForm.description}
                onChange={(e) =>
                  setCommitmentForm({
                    ...commitmentForm,
                    description: e.target.value,
                  })
                }
                placeholder="What result will you deliver?"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Target</Label>
                <Input
                  type="number"
                  min="0"
                  value={commitmentForm.targetValue}
                  onChange={(e) =>
                    setCommitmentForm({
                      ...commitmentForm,
                      targetValue: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>Unit</Label>
                <Input
                  value={commitmentForm.targetUnit}
                  onChange={(e) =>
                    setCommitmentForm({
                      ...commitmentForm,
                      targetUnit: e.target.value,
                    })
                  }
                  placeholder="tasks, pages, leads"
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              Deadline is automatically set to <strong>{deadline}</strong>.
              Commitments cannot be edited after the month closes.
            </div>

            {editingCommitment && (
              <>
                <div>
                  <Label>Completion %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={commitmentForm.completionPercent}
                    onChange={(e) =>
                      setCommitmentForm({
                        ...commitmentForm,
                        completionPercent: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <Label>Month-end result</Label>
                  <Textarea
                    value={commitmentForm.employeeNote}
                    onChange={(e) =>
                      setCommitmentForm({
                        ...commitmentForm,
                        employeeNote: e.target.value,
                      })
                    }
                    placeholder="What did you complete? Mention the result."
                  />
                </div>

                <div>
                  <Label>Evidence / reference</Label>
                  <Textarea
                    value={commitmentForm.evidence}
                    onChange={(e) =>
                      setCommitmentForm({
                        ...commitmentForm,
                        evidence: e.target.value,
                      })
                    }
                    placeholder="Optional evidence or HRMS reference."
                  />
                </div>
              </>
            )}

            <Button
              className="w-full"
              onClick={saveCommitment}
              disabled={
                !commitmentForm.title.trim() ||
                createCommitment.isPending ||
                updateCommitment.isPending
              }
            >
              <CheckCircle2 className="mr-1 h-4 w-4" />
              {editingCommitment ? 'Save result' : 'Save commitment'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
