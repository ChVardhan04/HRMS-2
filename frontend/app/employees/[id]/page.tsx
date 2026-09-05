'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, UserRound } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/auth-store';
import { useEmployee, useEmployees, useDepartments, useUpdateEmployee, useResendEmployeeActivation } from '@/features/employees/use-employees';
import { formatDate, initials } from '@/lib/utils';
import { apiFetch, api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function EmployeeProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: employee, isLoading } = useEmployee(id);
  const { data: departments } = useDepartments();
  const { data: allEmployees } = useEmployees('', 100);
  const canEdit = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({});
  const updateEmployee = useUpdateEmployee(id);
  const resendActivation = useResendEmployeeActivation();
  const qc = useQueryClient();
  const { data: documents } = useQuery({ queryKey: ['employee-documents', id], queryFn: () => api.get<any[]>(`/employees/${id}/documents`) });

  useEffect(() => {
    if (!employee) return;
    setForm({
      firstName: employee.firstName ?? '',
      lastName: employee.lastName ?? '',
      phone: employee.phone ?? '',
      dateOfBirth: employee.dateOfBirth ? new Date(employee.dateOfBirth).toISOString().slice(0, 10) : '',
      dateOfJoining: employee.dateOfJoining ? new Date(employee.dateOfJoining).toISOString().slice(0, 10) : '',
      employmentType: employee.employmentType ?? 'FULL_TIME',
      employmentStatus: employee.employmentStatus ?? 'PROBATION',
      departmentId: employee.departmentId ?? '',
      designationId: employee.designationId ?? '',
      managerId: employee.managerId ?? '',
      skipLevelManagerId: employee.skipLevelManagerId ?? '',
      location: employee.location ?? '',
      monthlySalary: employee.monthlySalary ? Number(employee.monthlySalary) : '',
      salaryCurrency: employee.salaryCurrency ?? 'INR',
      payrollEligible: employee.payrollEligible ?? true,
    });
  }, [employee]);

  const selectedDepartment = useMemo(() => departments?.find((d: any) => d.id === form.departmentId), [departments, form.departmentId]);
  const update = (key: string, value: string) => setForm((f: any) => ({ ...f, [key]: value, ...(key === 'departmentId' ? { designationId: '' } : {}) }));

  if (isLoading || !employee) return <AppShell title="Employee Profile"><div className="h-64 animate-pulse rounded-md bg-muted" /></AppShell>;

  return (
    <AppShell title="Employee Profile">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => router.push('/employees')}><ArrowLeft className="h-4 w-4" /> Employees</Button>
          <div className="flex items-center gap-2">
            {canEdit && employee.user?.mustChangePassword && (
              <Button variant="outline" onClick={() => resendActivation.mutate(id)} disabled={resendActivation.isPending}>
                {resendActivation.isPending ? 'Sending...' : 'Resend activation'}
              </Button>
            )}
            {canEdit && <Button onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /> Edit employee</Button>}
          </div>
        </div>

        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <Avatar className="h-16 w-16"><AvatarFallback className="text-lg">{initials(employee.firstName, employee.lastName)}</AvatarFallback></Avatar>
            <div className="flex-1"><h2 className="text-lg font-semibold">{employee.firstName} {employee.lastName}</h2><p className="text-sm text-muted-foreground">{employee.designation?.title ?? '-'} · {employee.department?.name ?? '-'}</p><p className="text-xs text-muted-foreground">{employee.employeeCode} · {employee.user?.email}</p></div>
            <div className="flex items-center gap-2"><StatusBadge status={employee.employmentStatus} />{employee.user?.mustChangePassword ? <Badge variant="outline">Pending activation</Badge> : <Badge variant="secondary">Account active</Badge>}</div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Employment details</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Date of birth</p><p>{employee.dateOfBirth ? formatDate(employee.dateOfBirth) : '-'}</p></div>
            <div><p className="text-xs text-muted-foreground">Joining date</p><p>{formatDate(employee.dateOfJoining)}</p></div>
            <div><p className="text-xs text-muted-foreground">Employment type</p><p>{String(employee.employmentType).replace('_', ' ')}</p></div>
            <div><p className="text-xs text-muted-foreground">Employment status</p><p>{String(employee.employmentStatus).replace('_', ' ')}</p></div>
            <div><p className="text-xs text-muted-foreground">Manager</p><p>{employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : '-'}</p></div>
            <div><p className="text-xs text-muted-foreground">Location</p><p>{employee.location ?? '-'}</p></div>
            <div><p className="text-xs text-muted-foreground">Phone</p><p>{employee.phone ?? '-'}</p></div>
            <div><p className="text-xs text-muted-foreground">Monthly salary</p><p>{employee.monthlySalary ? `${employee.salaryCurrency ?? 'INR'} ${Number(employee.monthlySalary).toLocaleString('en-IN')}` : 'Not configured'}</p></div>
          </CardContent></Card>

          <Card><CardHeader><CardTitle>Reports ({employee.reports?.length ?? 0})</CardTitle></CardHeader><CardContent>{!employee.reports?.length ? <p className="text-sm text-muted-foreground">No direct reports.</p> : <ul className="flex flex-col divide-y divide-border">{employee.reports.map((r: any) => <li key={r.id} className="flex items-center justify-between py-2 text-sm"><span>{r.firstName} {r.lastName}</span><Badge variant="outline">{r.employeeCode}</Badge></li>)}</ul>}</CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle>Roles</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{employee.user?.roles?.map((r: any) => <Badge key={r.role.name} variant="secondary">{r.role.name}</Badge>)}</CardContent></Card>

        <Card><CardHeader><CardTitle>Document vault</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-3">{canEdit && <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><span>Upload document</span><input hidden type="file" accept="application/pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); try { await apiFetch(`/employees/${id}/documents?type=HR_DOCUMENT`, { method: 'POST', body: form }); qc.invalidateQueries({ queryKey: ['employee-documents', id] }); } catch {} }} /></label>}{!documents?.length ? <p className="text-sm text-muted-foreground">No documents uploaded.</p> : <div className="flex flex-col divide-y divide-border">{documents.map((d: any) => <div key={d.id} className="flex items-center justify-between py-2 text-sm"><div><p className="font-medium">{d.fileName}</p><p className="text-xs text-muted-foreground">{d.type} · {d.expiresAt ? `Expires ${formatDate(d.expiresAt)}` : 'No expiry'}</p></div><Button size="sm" variant="outline" onClick={async () => { const result = await api.get<any>(`/employees/${id}/documents/${d.id}/download`); window.open(result.url, '_blank'); }}>Open</Button></div>)}</div>}</div></CardContent></Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Edit employee</DialogTitle><DialogDescription>HR/Admin can update the employee master. Employment type and lifecycle status are stored on the employee record and drive downstream HRMS workflows.</DialogDescription></DialogHeader>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); updateEmployee.mutate({ ...form, skipLevelManagerId: form.skipLevelManagerId || undefined, monthlySalary: form.monthlySalary === '' ? undefined : Number(form.monthlySalary), dateOfBirth: form.dateOfBirth || undefined, managerId: form.managerId || undefined, departmentId: form.departmentId || undefined, designationId: form.designationId || undefined, phone: form.phone || undefined, location: form.location || undefined }, { onSuccess: () => setOpen(false) }); }}>
              <div><Label>First name</Label><Input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required /></div>
              <div><Label>Last name</Label><Input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
              <div><Label>Date of birth</Label><Input type="date" value={form.dateOfBirth ?? ''} onChange={(e) => update('dateOfBirth', e.target.value)} /></div>
              <div><Label>Date of joining</Label><Input type="date" value={form.dateOfJoining} onChange={(e) => update('dateOfJoining', e.target.value)} required /></div>
              <div><Label>Employment type</Label><Select value={form.employmentType} onValueChange={(v) => update('employmentType', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[['FULL_TIME','Full time'],['PART_TIME','Part time'],['CONTRACT','Contract'],['INTERN','Intern']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Employment status</Label><Select value={form.employmentStatus} onValueChange={(v) => update('employmentStatus', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[['PROBATION','Probation'],['CONFIRMED','Confirmed'],['NOTICE_PERIOD','Notice period'],['EXITED','Exited']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Department</Label><Select value={form.departmentId} onValueChange={(v) => update('departmentId', v)}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Designation</Label><Select value={form.designationId} onValueChange={(v) => update('designationId', v)} disabled={!selectedDepartment}><SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger><SelectContent>{selectedDepartment?.designations?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Reporting manager</Label><Select value={form.managerId || 'none'} onValueChange={(v) => update('managerId', v === 'none' ? '' : v)}><SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger><SelectContent><SelectItem value="none">No manager</SelectItem>{allEmployees?.data?.filter((e: any) => e.id !== employee.id).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeCode}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Skip-level manager</Label><Select value={form.skipLevelManagerId || 'none'} onValueChange={(v) => update('skipLevelManagerId', v === 'none' ? '' : v)}><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{allEmployees?.data?.filter((e: any) => e.id !== employee.id && e.id !== form.managerId).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName} · {e.employeeCode}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => update('location', e.target.value)} /></div>
              <div><Label>Monthly salary</Label><Input type="number" min="0" value={form.monthlySalary} onChange={(e) => update('monthlySalary', e.target.value)} /></div>
              <div><Label>Salary currency</Label><Input value={form.salaryCurrency} onChange={(e) => update('salaryCurrency', e.target.value.toUpperCase())} /></div>
              <DialogFooter className="sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={updateEmployee.isPending}>{updateEmployee.isPending ? 'Saving...' : 'Save changes'}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
