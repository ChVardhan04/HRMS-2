'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useCreateEmployee, useDepartments, useEmployees } from '@/features/employees/use-employees';
import { initials } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';

const emptyForm = {
  email: '', personalEmail: '', firstName: '', lastName: '', phone: '', dateOfBirth: '', gender: '', emergencyContact: '', emergencyAddress: '', dateOfJoining: new Date().toISOString().slice(0, 10),
  employmentType: 'FULL_TIME', departmentId: '', designationId: '', managerId: '', skipLevelManagerId: '', location: '', monthlySalary: '', salaryCurrency: 'INR', payrollEligible: true, roleNames: ['EMPLOYEE'],
};

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const { data, isLoading } = useEmployees(search, 20, page);
  const { data: departments } = useDepartments();
  const { data: managers } = useEmployees('', 100);
  const createEmployee = useCreateEmployee();
  const canManage = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const selectedDepartment = useMemo(() => departments?.find((d: any) => d.id === form.departmentId), [departments, form.departmentId]);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value, ...(key === 'departmentId' ? { designationId: '' } : {}) }));

  return (
    <AppShell title="Employees">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Employee directory</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-64"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search by name, code, email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
            {canManage && <Button onClick={() => { setForm(emptyForm); setOpen(true); }}><Plus className="h-4 w-4" /> Add employee</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="h-40 animate-pulse rounded-md bg-muted" /> : !data?.data?.length ? <EmptyState icon={Users} title="No employees found" /> : (
            <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Designation</TableHead><TableHead>Manager</TableHead><TableHead>Employment</TableHead><TableHead>Account</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{data.data.map((emp: any) => <TableRow key={emp.id}>
                <TableCell><Link href={`/employees/${emp.id}`} className="flex items-center gap-2"><Avatar className="h-7 w-7"><AvatarFallback>{initials(emp.firstName, emp.lastName)}</AvatarFallback></Avatar><div><p className="text-sm font-medium">{emp.firstName} {emp.lastName}</p><p className="text-xs text-muted-foreground">{emp.employeeCode}</p></div></Link></TableCell>
                <TableCell>{emp.department?.name ?? '-'}</TableCell><TableCell>{emp.designation?.title ?? '-'}</TableCell><TableCell>{emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : '-'}</TableCell>
                <TableCell>{String(emp.employmentType ?? 'FULL_TIME').replace('_', ' ')}</TableCell><TableCell>{emp.user?.mustChangePassword ? <StatusBadge status="PENDING" /> : <StatusBadge status="ACTIVE" />}</TableCell><TableCell><StatusBadge status={emp.employmentStatus} /></TableCell>
              </TableRow>)}</TableBody></Table>
          )}
          {data?.meta?.totalPages > 1 && <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} employees</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add employee</DialogTitle><DialogDescription>Create the employee master record and assign the reporting structure. The employee will receive an activation link and create their own password.</DialogDescription></DialogHeader>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); createEmployee.mutate({ ...form, skipLevelManagerId: form.skipLevelManagerId || undefined, monthlySalary: form.monthlySalary ? Number(form.monthlySalary) : undefined, managerId: form.managerId || undefined, departmentId: form.departmentId || undefined, designationId: form.designationId || undefined, personalEmail: form.personalEmail || undefined, phone: form.phone || undefined, dateOfBirth: form.dateOfBirth || undefined, gender: form.gender || undefined, emergencyContact: form.emergencyContact || undefined, emergencyAddress: form.emergencyAddress || undefined, location: form.location || undefined }, { onSuccess: () => setOpen(false) }); }}>
            <div><Label>First name</Label><Input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} /></div>
            <div><Label>Last name</Label><Input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} /></div>
            <div><Label>Work email</Label><Input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></div>
            <div><Label>Personal email</Label><Input type="email" value={form.personalEmail} onChange={(e) => update('personalEmail', e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
            <div><Label>Date of birth</Label><Input type="date" value={form.dateOfBirth} onChange={(e) => update('dateOfBirth', e.target.value)} /></div>
            <div><Label>Gender</Label><Input value={form.gender} onChange={(e) => update('gender', e.target.value)} placeholder="Optional" /></div>
            <div><Label>Emergency contact</Label><Input value={form.emergencyContact} onChange={(e) => update('emergencyContact', e.target.value)} /></div>
            <div className="sm:col-span-2"><Label>Emergency address</Label><Input value={form.emergencyAddress} onChange={(e) => update('emergencyAddress', e.target.value)} /></div>
            <div><Label>Date of joining</Label><Input required type="date" value={form.dateOfJoining} onChange={(e) => update('dateOfJoining', e.target.value)} /></div>
            <div><Label>Employment type</Label><Select value={form.employmentType} onValueChange={(v) => update('employmentType', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[['FULL_TIME','Full time'],['PART_TIME','Part time'],['CONTRACT','Contract'],['INTERN','Intern']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Department</Label><Select value={form.departmentId} onValueChange={(v) => update('departmentId', v)}><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Designation</Label><Select value={form.designationId} onValueChange={(v) => update('designationId', v)} disabled={!selectedDepartment}><SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger><SelectContent>{selectedDepartment?.designations?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Reporting manager</Label><Select value={form.managerId} onValueChange={(v) => update('managerId', v)}><SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger><SelectContent>{managers?.data?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName} · {m.employeeCode}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Skip-level manager</Label><Select value={form.skipLevelManagerId} onValueChange={(v) => update('skipLevelManagerId', v)}><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>{managers?.data?.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName} · {m.employeeCode}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Location</Label><Input value={form.location} onChange={(e) => update('location', e.target.value)} placeholder="Office / Remote / City" /></div>
            <div><Label>Monthly salary (optional)</Label><Input type="number" min="0" value={form.monthlySalary} onChange={(e) => update('monthlySalary', e.target.value)} placeholder="Used by HR pay-attendance report" /></div>
            <div><Label>Salary currency</Label><Input value={form.salaryCurrency} onChange={(e) => update('salaryCurrency', e.target.value.toUpperCase())} /></div>
            <div><Label>System role</Label><Select value={form.roleNames[0]} onValueChange={(v) => setForm((f) => ({ ...f, roleNames: [v] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EMPLOYEE">Employee</SelectItem><SelectItem value="MANAGER">Manager</SelectItem></SelectContent></Select></div>
            <DialogFooter className="sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={createEmployee.isPending}>{createEmployee.isPending ? 'Creating...' : 'Create employee'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
