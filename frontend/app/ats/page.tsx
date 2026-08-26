'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, FileUp, Plus, Search, UserRound, Upload } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { api, apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';

const STAGES = ['SOURCED', 'APPLIED', 'RESUME_SCREEN', 'HR_SCREEN', 'TECHNICAL_ROUND', 'MANAGER_ROUND', 'OFFER', 'JOINED', 'REJECTED'];
const stageLabel = (s: string) => s.replace(/_/g, ' ');

export default function AtsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isHr = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const canViewPipeline = isHr;
  const [search, setSearch] = useState('');
  const [candidate, setCandidate] = useState<any | null>(null);
  const [screenOpen, setScreenOpen] = useState(false);
  const [screenFile, setScreenFile] = useState<File | undefined>();
  const [screenJob, setScreenJob] = useState('');
  const [screenFields, setScreenFields] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [req, setReq] = useState({ title: '', departmentName: '', seniority: '', skillsRequired: '', ctcBandMin: '', ctcBandMax: '', headcount: '1', jobDescription: '' });

  const { data: candidatesData, isLoading: candidatesLoading } = useQuery({ queryKey: ['ats', 'candidates'], queryFn: () => api.get<any>('/candidates?pageSize=100'), enabled: canViewPipeline });
  const { data: requisitions, isLoading: reqLoading } = useQuery({ queryKey: ['ats', 'requisitions'], queryFn: () => api.get<any[]>('/jobs/requisitions') });
  const { data: panelists } = useQuery({ queryKey: ['ats', 'panelists'], queryFn: () => api.get<any>('/employees?pageSize=100') });
  const candidates = candidatesData?.data ?? [];
  const filtered = useMemo(() => candidates.filter((c: any) => `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(search.toLowerCase())), [candidates, search]);
  const openPostings = useMemo(() => (requisitions ?? []).filter((r: any) => r.status === 'OPEN').flatMap((r: any) => (r.postings ?? []).map((p: any) => ({ ...p, requisition: r }))), [requisitions]);

  const createReq = useMutation({
    mutationFn: () => api.post('/jobs/requisitions', { ...req, skillsRequired: req.skillsRequired.split(',').map((x) => x.trim()).filter(Boolean), ctcBandMin: req.ctcBandMin ? Number(req.ctcBandMin) : undefined, ctcBandMax: req.ctcBandMax ? Number(req.ctcBandMax) : undefined, headcount: Number(req.headcount) }),
    onSuccess: () => { setReq({ title: '', departmentName: '', seniority: '', skillsRequired: '', ctcBandMin: '', ctcBandMax: '', headcount: '1', jobDescription: '' }); qc.invalidateQueries({ queryKey: ['ats', 'requisitions'] }); toast({ title: 'Job requisition created', variant: 'success' }); },
    onError: (e: any) => toast({ title: 'Could not create requisition', description: e.message, variant: 'destructive' }),
  });

  const approveReq = useMutation({ mutationFn: (id: string) => api.patch(`/jobs/requisitions/${id}/approve`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ats', 'requisitions'] }); toast({ title: 'HR approved requisition', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Approval failed', description: e.message, variant: 'destructive' }) });
  const publishReq = useMutation({ mutationFn: (id: string) => api.post(`/jobs/requisitions/${id}/publish`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ats', 'requisitions'] }); toast({ title: 'Job published', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Publish failed', description: e.message, variant: 'destructive' }) });
  const moveStage = useMutation({ mutationFn: ({ id, stage }: { id: string; stage: string }) => api.patch(`/candidates/${id}/stage`, { stage }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ats', 'candidates'] }); toast({ title: 'Candidate stage updated', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Could not update stage', description: e.message, variant: 'destructive' }) });
  const scheduleInterview = useMutation({ mutationFn: (payload: any) => api.post('/interviews', payload), onSuccess: () => toast({ title: 'Interview scheduled', variant: 'success' }) });

  async function screenResume() {
    if (!screenFile || !screenJob) return;
    const form = new FormData();
    form.append('jobPostingId', screenJob);
    form.append('resume', screenFile);
    Object.entries(screenFields).forEach(([key, value]) => value && form.append(key, value));
    try {
      const result = await apiFetch<any>('/ats/screen-resume', { method: 'POST', body: form });
      qc.invalidateQueries({ queryKey: ['ats', 'candidates'] });
      setCandidate({ ...result.candidate, screeningResults: [result.screening] });
      setScreenOpen(false);
      setScreenFile(undefined);
      setScreenJob('');
      setScreenFields({ firstName: '', lastName: '', email: '', phone: '' });
      toast({ title: `Resume screened: ${result.screening.atsScore}%`, description: 'Candidate was created/updated and added to the selected job pipeline.', variant: 'success' });
    } catch (e: any) {
      toast({ title: 'Resume screening failed', description: e.message, variant: 'destructive' });
    }
  }

  const latestScreening = candidate?.screeningResults?.[0];

  return (
    <AppShell title="Applicant Tracking System">
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div><h1 className="text-2xl font-semibold">Applicant Tracking System</h1><p className="text-sm text-muted-foreground">HR owns the full hiring workflow from job creation to offer.</p></div>
          {isHr && <Button onClick={() => setScreenOpen(true)}><Upload className="h-4 w-4" /> Screen resume</Button>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Open jobs</p><p className="mt-1 text-2xl font-semibold">{openPostings.length}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Candidates</p><p className="mt-1 text-2xl font-semibold">{candidates.length}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Screened</p><p className="mt-1 text-2xl font-semibold">{candidates.filter((c: any) => c.screeningResults?.length).length}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Published jobs</p><p className="mt-1 text-2xl font-semibold">{openPostings.filter((p: any) => p.isPublished).length}</p></CardContent></Card>
        </div>

        <Tabs defaultValue={canViewPipeline ? 'pipeline' : 'jobs'}>
          <TabsList>{canViewPipeline && <TabsTrigger value="pipeline">Candidate pipeline</TabsTrigger>}<TabsTrigger value="jobs">Jobs & requisitions</TabsTrigger></TabsList>

          {canViewPipeline && <TabsContent value="pipeline" className="space-y-4">
            <Card><CardContent className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidate..." /></div></CardContent></Card>
            {candidatesLoading ? <div className="h-96 animate-pulse rounded-xl bg-muted" /> : !filtered.length ? <EmptyState icon={UserRound} title="No candidates" description="Use Screen resume to create the first candidate and attach them to a job." /> : <div className="flex gap-4 overflow-x-auto pb-4">{STAGES.map((stage) => { const stageCandidates = filtered.filter((c: any) => c.currentStage === stage); return <Card key={stage} className="w-80 shrink-0"><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">{stageLabel(stage)}<Badge variant="secondary">{stageCandidates.length}</Badge></CardTitle></CardHeader><CardContent className="space-y-2">{stageCandidates.map((c: any) => { const screening = c.screeningResults?.[0]; return <button key={c.id} className="w-full rounded-xl border bg-background p-3 text-left transition hover:border-primary/40 hover:shadow-card" onClick={() => setCandidate(c)}><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{c.firstName} {c.lastName}</p><p className="text-xs text-muted-foreground">{c.email}</p></div>{screening && <Badge variant={Number(screening.atsScore) >= 80 ? 'success' : 'outline'}>{Number(screening.atsScore).toFixed(0)}%</Badge>}</div><p className="mt-3 text-xs text-muted-foreground">{c.source ?? 'Other'} · {c.experienceYears ?? 0} yrs</p></button>})}</CardContent></Card> })}</div>}
          </TabsContent>}

          <TabsContent value="jobs" className="space-y-4">
            {isHr && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Create job requisition</CardTitle></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); createReq.mutate(); }}><div><Label>Role title</Label><Input required value={req.title} onChange={(e) => setReq({ ...req, title: e.target.value })} /></div><div><Label>Department</Label><Input value={req.departmentName} onChange={(e) => setReq({ ...req, departmentName: e.target.value })} /></div><div><Label>Seniority</Label><Input value={req.seniority} onChange={(e) => setReq({ ...req, seniority: e.target.value })} placeholder="3-5 years" /></div><div><Label>Required skills</Label><Input value={req.skillsRequired} onChange={(e) => setReq({ ...req, skillsRequired: e.target.value })} placeholder="Java, Spring Boot, React" /></div><div><Label>CTC min</Label><Input type="number" value={req.ctcBandMin} onChange={(e) => setReq({ ...req, ctcBandMin: e.target.value })} /></div><div><Label>CTC max</Label><Input type="number" value={req.ctcBandMax} onChange={(e) => setReq({ ...req, ctcBandMax: e.target.value })} /></div><div><Label>Headcount</Label><Input type="number" min="1" value={req.headcount} onChange={(e) => setReq({ ...req, headcount: e.target.value })} /></div><div className="md:col-span-2"><Label>Job description</Label><textarea className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm" value={req.jobDescription} onChange={(e) => setReq({ ...req, jobDescription: e.target.value })} /></div><div className="md:col-span-2"><Button type="submit" disabled={createReq.isPending}>Create requisition</Button></div></form></CardContent></Card>}
            {reqLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : requisitions?.map((r: any) => <Card key={r.id}><CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{r.title}</h3><Badge variant="outline">{r.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{r.departmentName ?? 'Unassigned'} · {r.headcount ?? 1} position(s) · {r.seniority ?? 'Any seniority'}</p><p className="mt-1 text-xs text-muted-foreground">HR approval: {r.hrApprovedById ? 'Complete' : 'Pending'} · {r.postings?.some((p: any) => p.isPublished) ? 'Published' : 'Not published'}</p></div><div className="flex gap-2">{isHr && r.status === 'PENDING_APPROVAL' && <Button size="sm" onClick={() => approveReq.mutate(r.id)}>Approve</Button>}{isHr && r.status === 'OPEN' && !r.postings?.some((p: any) => p.isPublished) && <Button size="sm" variant="outline" onClick={() => publishReq.mutate(r.id)}>Publish job</Button>}</div></CardContent></Card>)}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={screenOpen} onOpenChange={setScreenOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Screen a resume against a job</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Job</Label><Select value={screenJob} onValueChange={setScreenJob}><SelectTrigger><SelectValue placeholder="Select an open job" /></SelectTrigger><SelectContent>{openPostings.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.requisition.title}</SelectItem>)}</SelectContent></Select></div><div><Label>Resume</Label><label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 text-sm"><FileUp className="h-4 w-4" />{screenFile?.name ?? 'Upload PDF or DOCX'}<input hidden type="file" accept="application/pdf,.doc,.docx" onChange={(e) => setScreenFile(e.target.files?.[0])} /></label></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>First name <span className="text-muted-foreground">optional</span></Label><Input value={screenFields.firstName} onChange={(e) => setScreenFields({ ...screenFields, firstName: e.target.value })} /></div><div><Label>Last name <span className="text-muted-foreground">optional</span></Label><Input value={screenFields.lastName} onChange={(e) => setScreenFields({ ...screenFields, lastName: e.target.value })} /></div><div><Label>Email <span className="text-muted-foreground">optional</span></Label><Input value={screenFields.email} onChange={(e) => setScreenFields({ ...screenFields, email: e.target.value })} /></div><div><Label>Phone <span className="text-muted-foreground">optional</span></Label><Input value={screenFields.phone} onChange={(e) => setScreenFields({ ...screenFields, phone: e.target.value })} /></div></div><div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">The system parses the resume, creates or reuses the candidate, links the candidate to this job, calculates the JD-specific ATS score, stores the screening result, and adds the candidate to the pipeline.</div></div><DialogFooter><Button variant="outline" onClick={() => setScreenOpen(false)}>Cancel</Button><Button onClick={screenResume} disabled={!screenFile || !screenJob}>Screen & add candidate</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={Boolean(candidate)} onOpenChange={(open) => !open && setCandidate(null)}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{candidate?.firstName} {candidate?.lastName}</DialogTitle></DialogHeader>{candidate && <div className="space-y-4"><div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-4 text-sm"><div><p className="text-xs text-muted-foreground">Email</p><p>{candidate.email}</p></div><div><p className="text-xs text-muted-foreground">Experience</p><p>{candidate.experienceYears ?? 0} years</p></div></div>{latestScreening && <div className="rounded-xl border p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">ATS screening</p><p className="text-xs text-muted-foreground">{latestScreening.recommendation}</p></div><p className="text-3xl font-semibold">{Number(latestScreening.atsScore).toFixed(0)}%</p></div><div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Skills</p><p>{Number(latestScreening.skillsScore).toFixed(0)}%</p></div><div><p className="text-xs text-muted-foreground">Experience</p><p>{Number(latestScreening.experienceScore).toFixed(0)}%</p></div><div><p className="text-xs text-muted-foreground">Education</p><p>{Number(latestScreening.educationScore).toFixed(0)}%</p></div></div><div className="mt-4"><p className="mb-2 text-xs font-medium">Matched skills</p><div className="flex flex-wrap gap-2">{latestScreening.matchedSkills?.map((s: string) => <Badge key={s} variant="secondary">{s}</Badge>)}</div><p className="mb-2 mt-4 text-xs font-medium">Missing skills</p><div className="flex flex-wrap gap-2">{latestScreening.missingSkills?.length ? latestScreening.missingSkills.map((s: string) => <Badge key={s} variant="outline">{s}</Badge>) : <span className="text-xs text-muted-foreground">No required skills missing.</span>}</div></div></div>}<div><Label>Pipeline stage</Label><Select value={candidate.currentStage} onValueChange={(stage) => moveStage.mutate({ id: candidate.id, stage })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((stage) => <SelectItem key={stage} value={stage}>{stageLabel(stage)}</SelectItem>)}</SelectContent></Select></div></div>}<DialogFooter><Button variant="outline" onClick={() => setCandidate(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
    </AppShell>
  );
}
