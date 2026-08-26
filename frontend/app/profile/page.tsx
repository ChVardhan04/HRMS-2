'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { normalizeRoles } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

export default function ProfilePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me, isLoading } = useQuery({ queryKey: ['users', 'me'], queryFn: () => api.get<any>('/users/me') });
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', personalEmail: '', location: '' });

  useEffect(() => {
    if (!me?.employee) return;
    setForm({
      firstName: me.employee.firstName ?? '',
      lastName: me.employee.lastName ?? '',
      phone: me.employee.phone ?? '',
      personalEmail: me.employee.personalEmail ?? '',
      location: me.employee.location ?? '',
    });
  }, [me]);

  const update = useMutation({
    mutationFn: () => api.patch('/users/me/profile', form),
    onSuccess: (data) => {
      qc.setQueryData(['users', 'me'], data);
      toast({ title: 'Profile updated', description: 'Your contact details were saved.', variant: 'success' });
    },
    onError: (err: any) => toast({ title: 'Update failed', description: err.message, variant: 'destructive' }),
  });

  return (
    <AppShell title="My Profile">
      {isLoading || !me?.employee ? (
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
                <div className="flex flex-col gap-1.5"><Label>First name</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
                <div className="flex flex-col gap-1.5"><Label>Last name</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
                <div className="flex flex-col gap-1.5"><Label>Work email</Label><Input value={me.email} disabled /></div>
                <div className="flex flex-col gap-1.5"><Label>Personal email</Label><Input type="email" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} /></div>
                <div className="flex flex-col gap-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="flex flex-col gap-1.5"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                <div className="sm:col-span-2"><Button type="submit" disabled={update.isPending}>{update.isPending ? 'Saving...' : 'Save changes'}</Button></div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Employee code</p><p>{me.employee.employeeCode}</p></div>
              <div><p className="text-xs text-muted-foreground">Department</p><p>{me.employee.department?.name ?? '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">Designation</p><p>{me.employee.designation?.title ?? '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">Joined</p><p>{formatDate(me.employee.dateOfJoining)}</p></div>
              <div><p className="text-xs text-muted-foreground">Employment type</p><p>{String(me.employee.employmentType ?? 'FULL_TIME').replace('_', ' ')}</p></div>
              <div><p className="text-xs text-muted-foreground">Employment status</p><p>{String(me.employee.employmentStatus ?? 'PROBATION').replace('_', ' ')}</p></div>
              <div><p className="text-xs text-muted-foreground">Roles</p><div className="mt-1 flex flex-wrap gap-1">{normalizeRoles(me.roles ?? []).map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}</div></div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
