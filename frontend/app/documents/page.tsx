'use client';

import { useMemo, useState } from 'react';
import { Download, FileLock2, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { api, apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';

export default function DocumentsPage() {
  const user = useAuthStore((s) => s.user);
  const isHr = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState(user?.employee?.id ?? '');
  const { data: employees } = useQuery({ queryKey: ['employees', 'documents'], queryFn: () => api.get<any>('/employees?pageSize=100') , enabled: isHr });
  const employeeId = selectedEmployee || user?.employee?.id || '';
  const { data: docs, isLoading } = useQuery({ queryKey: ['documents', employeeId], queryFn: () => api.get<any[]>(`/employees/${employeeId}/documents`), enabled: Boolean(employeeId) });
  const upload = useMutation({ mutationFn: async (file: File) => { const form = new FormData(); form.append('file', file); return apiFetch(`/employees/${employeeId}/documents?type=EMPLOYEE_DOCUMENT`, { method: 'POST', body: form }); }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents', employeeId] }); toast({ title: 'Document uploaded', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }) });
  const employeeName = useMemo(() => employees?.data?.find((e: any) => e.id === employeeId), [employees, employeeId]);

  async function download(id: string) {
    try { const result = await api.get<any>(`/employees/${employeeId}/documents/${id}/download`); window.open(result.url, '_blank', 'noopener,noreferrer'); } catch (e: any) { toast({ title: 'Could not open document', description: e.message, variant: 'destructive' }); }
  }

  return <AppShell title="Documents">
    <div className="mx-auto max-w-5xl space-y-4">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileLock2 className="h-4 w-4 text-primary" /> Employee document vault</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        {isHr ? <div><Label>Employee</Label><Select value={employeeId} onValueChange={setSelectedEmployee}><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{employees?.data?.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeCode}</SelectItem>)}</SelectContent></Select></div> : <div><p className="text-sm text-muted-foreground">Your documents</p><p className="font-medium">{user?.employee ? `${user.employee.firstName} ${user.employee.lastName}` : '-'}</p></div>}
        {employeeId && <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><Upload className="mr-2 h-4 w-4" /> Upload<input type="file" hidden accept="application/pdf,image/jpeg,image/png,.doc,.docx" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} /></label>}
      </CardContent></Card>
      <Card><CardContent className="p-0">{isLoading ? <div className="m-6 h-40 animate-pulse rounded-xl bg-muted" /> : !docs?.length ? <div className="p-6"><EmptyState icon={FileLock2} title="No documents" description={employeeName ? `${employeeName.firstName}'s document vault is empty.` : 'Upload HR documents when needed.'} /></div> : <div className="divide-y">{docs.map((d: any) => <div key={d.id} className="flex items-center justify-between gap-4 px-6 py-4"><div><p className="font-medium">{d.fileName}</p><p className="text-xs text-muted-foreground">{d.type} · Version {d.version} · {new Date(d.createdAt).toLocaleDateString()}</p></div><Button variant="outline" size="sm" onClick={() => download(d.id)}><Download className="mr-2 h-4 w-4" /> Open</Button></div>)}</div>}</CardContent></Card>
    </div>
  </AppShell>;
}
