'use client';

import { useMemo, useState } from 'react';
import { BriefcaseBusiness, Plus } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartments, useDepartment, useCreateDesignation } from '@/features/departments/use-departments';

export default function DesignationsPage() {
  const { data: departments } = useDepartments();
  const [departmentId, setDepartmentId] = useState('');
  const [title, setTitle] = useState('');
  const create = useCreateDesignation();
  const selected = useMemo(() => departments?.find((d:any) => d.id === departmentId), [departments, departmentId]);
  const activeDepartmentId = departmentId || departments?.[0]?.id || '';
  const { data: department } = useDepartment(activeDepartmentId);

  return <AppShell title="Designations">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-primary" /> Department designations</CardTitle>
        <p className="text-sm text-muted-foreground">HR can create and maintain designations by department. These designations are used in Employee Master and KRA configuration.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="max-w-md"><Label>Department</Label><Select value={activeDepartmentId} onValueChange={setDepartmentId}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments?.map((d:any)=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex max-w-xl gap-2"><Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g. Senior SEO Analyst"/><Button disabled={!activeDepartmentId || !title.trim() || create.isPending} onClick={()=>create.mutate({title:title.trim(),departmentId:activeDepartmentId},{onSuccess:()=>setTitle('')})}><Plus className="h-4 w-4"/> Add designation</Button></div>
        <div><p className="mb-2 text-sm font-medium">{selected?.name ?? department?.name ?? 'Department'} designations</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{department?.designations?.map((d:any)=><div key={d.id} className="rounded-lg border p-3 text-sm font-medium">{d.title}</div>)}{!department?.designations?.length&&<p className="text-sm text-muted-foreground">No designations configured for this department.</p>}</div></div>
      </CardContent>
    </Card>
  </AppShell>;
}
