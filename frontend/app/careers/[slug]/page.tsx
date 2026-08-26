'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Upload } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-client';

export default function CareerDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ['public-career', params.slug], queryFn: () => apiFetch<any>(`/jobs/careers/${params.slug}`) });
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', skills: '', experienceYears: '' });
  const [resume, setResume] = useState<File | null>(null);
  const apply = useMutation({ mutationFn: async () => { if (!resume) throw new Error('Please attach your resume'); const body = new FormData(); Object.entries(form).forEach(([key, value]) => body.append(key, value)); body.append('resume', resume); return apiFetch(`/jobs/careers/${params.slug}/apply`, { method: 'POST', body }); }, onSuccess: () => router.push('/careers?applied=1') });
  if (isLoading) return <main className="min-h-screen p-8"><div className="mx-auto max-w-4xl h-64 animate-pulse rounded-2xl bg-muted" /></main>;
  if (!data) return <main className="min-h-screen p-8"><p>Job not found.</p></main>;
  const role = data.requisition;
  return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-4xl"><Link href="/careers" className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> All roles</Link><div className="grid gap-6 lg:grid-cols-[1fr_380px]"><Card><CardHeader><CardTitle className="text-2xl">{role.title}</CardTitle><p className="text-sm text-muted-foreground">{role.departmentName ?? 'Company'} · {role.seniority ?? 'Any level'} · {role.headcount ?? 1} position(s)</p></CardHeader><CardContent className="space-y-5"><div><h2 className="font-semibold">About the role</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{role.jobDescription ?? 'We are looking for a strong contributor to join our team.'}</p></div><div><h2 className="font-semibold">Skills</h2><p className="mt-2 text-sm text-muted-foreground">{role.skillsRequired?.join(', ') || 'Not specified'}</p></div><div><h2 className="font-semibold">Compensation</h2><p className="mt-2 text-sm text-muted-foreground">{role.ctcBandMin || role.ctcBandMax ? `${role.ctcBandMin ?? '-'} - ${role.ctcBandMax ?? '-'} CTC` : 'Competitive'}</p></div></CardContent></Card><Card><CardHeader><CardTitle>Apply for this role</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); apply.mutate(); }}><div className="grid grid-cols-2 gap-3"><div><Label>First name</Label><Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div><div><Label>Last name</Label><Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div></div><div><Label>Email</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div><div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div><div><Label>Skills</Label><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, Java, SQL" /></div><div><Label>Experience (years)</Label><Input type="number" min="0" value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: e.target.value })} /></div><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm"><Upload className="h-4 w-4" />{resume ? resume.name : 'Attach resume (PDF/DOC/DOCX, max 5 MB)'}<input hidden type="file" accept="application/pdf,.doc,.docx" onChange={(e) => setResume(e.target.files?.[0] ?? null)} /></label><Button className="w-full" type="submit" disabled={apply.isPending}>{apply.isPending ? 'Submitting...' : 'Submit application'}</Button>{apply.error && <p className="text-sm text-destructive">{(apply.error as Error).message}</p>}</form></CardContent></Card></div></div></main>;
}
