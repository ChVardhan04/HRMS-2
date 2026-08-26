'use client';

import Link from 'next/link';
import { BriefcaseBusiness } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { api } from '@/lib/api-client';

export default function CareersPage() {
  const { data, isLoading } = useQuery({ queryKey: ['public-careers'], queryFn: () => api.get<any[]>('/jobs/careers') });
  return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-4xl"><div className="mb-8"><p className="text-sm font-medium text-primary">HRMS Careers</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Build your next chapter with us.</h1><p className="mt-2 max-w-2xl text-muted-foreground">Explore open roles and apply directly. Applications go straight into the hiring pipeline.</p></div>{isLoading ? <div className="h-64 animate-pulse rounded-2xl bg-muted" /> : !data?.length ? <EmptyState icon={BriefcaseBusiness} title="No open roles" description="There are no published positions right now." /> : <div className="grid gap-4">{data.map((job: any) => <Link href={`/careers/${job.publicSlug}`} key={job.id}><Card className="transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"><CardHeader><CardTitle>{job.requisition.title}</CardTitle><div className="flex flex-wrap gap-2"><Badge variant="secondary">{job.requisition.departmentName ?? 'Company'}</Badge><Badge variant="outline">{job.requisition.seniority ?? 'Any level'}</Badge></div></CardHeader><CardContent><p className="line-clamp-3 text-sm text-muted-foreground">{job.requisition.jobDescription ?? 'See the role details and apply.'}</p></CardContent></Card></Link>)}</div>}</div></main>;
}
