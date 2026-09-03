'use client';

import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, CalendarDays, Target, WandSparkles, Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { KraSummaryCard } from '@/components/kra/kra-summary-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { useAuthStore } from '@/lib/auth-store';
import { useKraTemplates, useMyDailyKra, useTeamKraScores, useConfigureKraTemplate } from '@/features/kra/use-kra';
import { useDepartments, useDepartment } from '@/features/departments/use-departments';
import { useToast } from '@/hooks/use-toast';

export default function KraPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const isHr = hasRole('HR_ADMIN', 'SUPER_ADMIN');
  const canViewTeam = hasRole('MANAGER', 'HR_ADMIN', 'SUPER_ADMIN');
  const now = new Date();
  const [month] = useState(now.getMonth()+1);
  const [year] = useState(now.getFullYear());
  const { data: team } = useTeamKraScores(month, year, canViewTeam);
  const { data: daily } = useMyDailyKra(month, year);
  const { data: departments } = useDepartments();
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [roleProfile, setRoleProfile] = useState('');
  const { data: selectedDepartment } = useDepartment(departmentId, month, year);
  const { data: templates } = useKraTemplates(departmentId, isHr);
  const configure = useConfigureKraTemplate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const designations = selectedDepartment?.designations ?? [];
  const selectedDesignation = designations.find((d:any)=>d.id===designationId);
  const existingTemplate = useMemo(() => templates?.find((t:any)=>t.designationId===designationId), [templates, designationId]);

  useEffect(() => {
    if (!departmentId && departments?.[0]?.id) setDepartmentId(departments[0].id);
  }, [departments, departmentId]);
  useEffect(() => {
    if (designations.length && !designations.some((d:any)=>d.id===designationId)) setDesignationId(designations[0].id);
    if (!designations.length) setDesignationId('');
  }, [designations, designationId]);
  useEffect(() => {
    if (existingTemplate?.description) setRoleProfile(existingTemplate.description);
    else if (selectedDesignation?.title && !roleProfile) setRoleProfile(`Define the day-to-day responsibilities, expected outputs, quality standards and measurable KPIs for ${selectedDesignation.title}.`);
  }, [existingTemplate, selectedDesignation]);

  const saveGenerated = () => {
    if (!departmentId || !designationId || !selectedDesignation || !roleProfile.trim()) return;
    configure.mutate({ departmentId, designationId, roleName:selectedDesignation.title, roleProfile:roleProfile.trim() }, {
      onSuccess: (result:any) => {
        qc.invalidateQueries({ queryKey:['kra'] });
        toast({ title:'KRA configuration saved', description:`${result.items?.length ?? 0} metrics are now attached to ${selectedDesignation.title}.`, variant:'success' });
      },
      onError:(e:any)=>toast({title:'Could not configure KRA',description:e.message,variant:'destructive'})
    });
  };

  return <AppShell title="KRA & Performance">
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-xl"><KraSummaryCard /></div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary"/> Daily KRA calculation · {now.toLocaleString('en-US',{month:'long',year:'numeric'})}</CardTitle></CardHeader>
        <CardContent>
          {!daily?.length ? <p className="text-sm text-muted-foreground">Daily KRA snapshots appear automatically on working days after the scheduled calculation.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Projected score</TableHead><TableHead>Provider</TableHead></TableRow></TableHeader><TableBody>{daily.slice().reverse().slice(0,10).map((d:any)=><TableRow key={d.id}><TableCell>{String(d.date).slice(0,10)}</TableCell><TableCell className="font-medium">{Number(d.finalScore).toFixed(1)}%</TableCell><TableCell>{d.provider === 'openai' ? 'AI evaluation' : 'Evidence fallback'}</TableCell></TableRow>)}</TableBody></Table></div>}
        </CardContent>
      </Card>

      {canViewTeam && <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4 text-primary"/> Team KRA · {now.toLocaleString('en-US',{month:'long',year:'numeric'})}</CardTitle></CardHeader>
        <CardContent>{!team?.length ? <EmptyState icon={Target} title="No calculated scores yet" description="Daily evidence is collected from attendance, tasks, DPR and manager-reviewed quality. Month-end uses the complete monthly evidence set."/> : <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Designation</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{team.map((s:any)=><TableRow key={s.id}><TableCell><p className="font-medium">{s.employee.firstName} {s.employee.lastName}</p><p className="text-xs text-muted-foreground">{s.employee.employeeCode}</p></TableCell><TableCell>{s.employee.department?.name ?? '-'}</TableCell><TableCell>{s.employee.designation?.title ?? '-'}</TableCell><TableCell className="font-medium">{Number(s.finalScore).toFixed(1)}%</TableCell><TableCell>{s.isFinal ? 'Final' : 'Projected'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent>
      </Card>}

      {isHr && <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary"/> AI KRA configuration</CardTitle><p className="text-sm text-muted-foreground">HR defines the role context once. The AI generates measurable KRA metrics, targets and weights; the system then evaluates those metrics from recorded monthly activity instead of requiring HR to manually score every employee.</p></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>Department</Label><Select value={departmentId} onValueChange={(v)=>{setDepartmentId(v);setDesignationId('');setRoleProfile('')}}><SelectTrigger><SelectValue placeholder="Select department"/></SelectTrigger><SelectContent>{departments?.map((d:any)=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Designation</Label><Select value={designationId} onValueChange={(v)=>setDesignationId(v)} disabled={!designations.length}><SelectTrigger><SelectValue placeholder="Select designation"/></SelectTrigger><SelectContent>{designations.map((d:any)=><SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent></Select>{!designations.length&&<p className="mt-1 text-xs text-muted-foreground">Add a designation from Departments before configuring KRA.</p>}</div>
          </div>
          <div><Label>Role profile / KPI input for AI</Label><Textarea value={roleProfile} onChange={(e)=>setRoleProfile(e.target.value)} rows={7} placeholder="Describe responsibilities, expected outputs, quality standards, target numbers and role-specific work. You can paste the HR KRA sheet content here."/><p className="mt-1 text-xs text-muted-foreground">For the HR-provided roles, the supplied KRA library already contains the metrics from the KRA PDF. For a new designation, paste its role scope here and generate a new template.</p></div>
          <div className="flex flex-wrap items-center gap-3"><Button onClick={saveGenerated} disabled={!departmentId||!designationId||!roleProfile.trim()||configure.isPending}><WandSparkles className="h-4 w-4"/>{existingTemplate ? 'Regenerate & Save KRA' : 'Generate & Save KRA'}</Button>{existingTemplate&&<span className="text-sm text-muted-foreground">Current template: {existingTemplate.items?.length ?? 0} metrics · {existingTemplate.isActive ? 'Active' : 'Inactive'}</span>}</div>
          {existingTemplate?.items?.length ? <div><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Save className="h-4 w-4"/> Active metrics for {selectedDesignation?.title}</div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Target</TableHead><TableHead>Weight</TableHead><TableHead>Mode</TableHead></TableRow></TableHeader><TableBody>{existingTemplate.items.map((i:any)=><TableRow key={i.id}><TableCell><p className="font-medium">{i.name}</p><p className="text-xs text-muted-foreground">{i.description}</p></TableCell><TableCell>{i.targetText ?? (i.targetValue != null ? `${i.targetValue}${i.unit ?? ''}` : '-')}</TableCell><TableCell>{Number(i.weightPercent).toFixed(1)}%</TableCell><TableCell>{i.isAutomated ? 'AI / activity' : 'Manual'}</TableCell></TableRow>)}</TableBody></Table></div></div> : null}
        </CardContent>
      </Card>}
    </div>
  </AppShell>;
}
