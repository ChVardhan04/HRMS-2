'use client';

import { useMemo, useState } from 'react';
import { BriefcaseBusiness, Pencil, Plus, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDepartments, useDepartment, useCreateDesignation, useDeleteDesignation, useUpdateDesignation } from '@/features/departments/use-departments';

export default function DesignationsPage() {
  const { data: departments } = useDepartments();
  const [departmentId, setDepartmentId] = useState('');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const create = useCreateDesignation();
  const update = useUpdateDesignation();
  const remove = useDeleteDesignation();
  const activeDepartmentId = departmentId || departments?.[0]?.id || '';
  const selected = useMemo(() => departments?.find((d:any) => d.id === activeDepartmentId), [departments, activeDepartmentId]);
  const { data: department } = useDepartment(activeDepartmentId);
  const designations = department?.designations ?? selected?.designations ?? [];

  return <AppShell title="Designations">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-primary" /> Department designations</CardTitle>
        <p className="text-sm text-muted-foreground">HR can create, rename and remove designations. Removing a designation only hides it from new assignments; employees already assigned to it must be moved first.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="max-w-md"><Label>Department</Label><Select value={activeDepartmentId} onValueChange={setDepartmentId}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments?.map((d:any)=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex flex-col gap-2 sm:flex-row sm:max-w-xl"><Input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g. Senior SEO Analyst"/><Button disabled={!activeDepartmentId || !title.trim() || create.isPending} onClick={()=>create.mutate({title:title.trim(),departmentId:activeDepartmentId},{onSuccess:()=>setTitle('')})}><Plus className="h-4 w-4"/> Add designation</Button></div>
        <div>
          <p className="mb-2 text-sm font-medium">{selected?.name ?? department?.name ?? 'Department'} designations</p>
          {!designations.length ? <p className="text-sm text-muted-foreground">No designations configured for this department.</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{designations.map((d:any)=><div key={d.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span className="min-w-0 truncate font-medium">{d.title}</span><div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${d.title}`} onClick={()=>setEditing({ ...d })}><Pencil className="h-4 w-4"/></Button><Button size="icon" variant="ghost" aria-label={`Remove ${d.title}`} onClick={()=>setDeleting(d)}><Trash2 className="h-4 w-4 text-destructive"/></Button></div></div>)}</div>}
        </div>
      </CardContent>
    </Card>

    <Dialog open={!!editing} onOpenChange={(v)=>!v&&setEditing(null)}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Edit designation</DialogTitle><DialogDescription>Rename this designation without creating a new record. Existing KRA and employee links remain attached to the same designation.</DialogDescription></DialogHeader>
        <div><Label>Designation name</Label><Input value={editing?.title ?? ''} onChange={(e)=>setEditing((x:any)=>({ ...x, title:e.target.value }))}/></div>
        <DialogFooter><Button variant="ghost" onClick={()=>setEditing(null)}>Cancel</Button><Button disabled={!editing?.title?.trim() || update.isPending} onClick={()=>update.mutate({id:editing.id,title:editing.title.trim()},{onSuccess:()=>setEditing(null)})}>{update.isPending ? 'Saving...' : 'Save changes'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!deleting} onOpenChange={(v)=>!v&&setDeleting(null)}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Remove designation?</DialogTitle><DialogDescription>“{deleting?.title}” will be removed from the active designation list. Employees already assigned to it must be reassigned before removal.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="ghost" onClick={()=>setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={remove.isPending} onClick={()=>remove.mutate(deleting.id,{onSuccess:()=>setDeleting(null)})}>{remove.isPending ? 'Removing...' : 'Remove designation'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </AppShell>;
}
