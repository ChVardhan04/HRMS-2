'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useAuthStore, normalizeRoles } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const changePassword = useMutation({
    mutationFn: () => {
      if (form.newPassword !== form.confirmPassword) throw new Error('New passwords do not match');
      if (form.newPassword.length < 8) throw new Error('New password must be at least 8 characters');
      return api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
    },
    onSuccess: () => { setForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); toast({ title: 'Password changed', description: 'Your password has been updated.', variant: 'success' }); },
    onError: (err: any) => toast({ title: 'Could not change password', description: err.message, variant: 'destructive' }),
  });

  return <AppShell title="Settings">
    <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Account</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div><p className="text-xs text-muted-foreground">Signed in as</p><p className="font-medium">{user?.email ?? '-'}</p></div><div><p className="text-xs text-muted-foreground">Roles</p><div className="mt-1 flex flex-wrap gap-1">{normalizeRoles(user?.roles ?? []).map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}</div></div><p className="text-xs text-muted-foreground">System and HR configuration are role-controlled. This page currently exposes account security; HR/Admin configuration will appear only where the logged-in role has permission.</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Change password</CardTitle></CardHeader><CardContent><form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); changePassword.mutate(); }}><div><Label>Current password</Label><Input type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></div><div><Label>New password</Label><Input type="password" required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></div><div><Label>Confirm new password</Label><Input type="password" required value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></div><Button type="submit" disabled={changePassword.isPending}>{changePassword.isPending ? 'Saving...' : 'Change password'}</Button></form></CardContent></Card>
    </div>
  </AppShell>;
}
