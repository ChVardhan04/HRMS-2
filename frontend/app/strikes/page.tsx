'use client';

import { ShieldAlert } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

const COLOR_VARIANT: Record<string, 'success' | 'warning' | 'destructive'> = { GREEN: 'success', YELLOW: 'warning', ORANGE: 'warning', RED: 'destructive' };

export default function StrikesPage() {
  const isManager = useAuthStore((s) => s.hasRole('MANAGER'));
  const isHr = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const { data: employees, isLoading } = useQuery({ queryKey: ['strikes', 'dashboard'], queryFn: () => api.get<any[]>('/strikes/dashboard'), enabled: isManager || isHr });
  const { data: mine } = useQuery({ queryKey: ['strikes', 'me'], queryFn: () => api.get<any[]>('/strikes/me'), enabled: !isManager && !isHr });
  const qc = useQueryClient(); const { toast } = useToast();
  const resolve = useMutation({ mutationFn: (id: string) => api.patch(`/strikes/${id}/resolve`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['strikes'] }); toast({ title: 'Strike resolved', variant: 'success' }); } });
  const pip = useMutation({ mutationFn: ({ id, employeeId }: any) => api.post(`/strikes/${id}/pip-task`, { employeeId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['strikes'] }); toast({ title: 'PIP task created', variant: 'success' }); } });
  return <AppShell title="Three-Strike Dashboard"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Performance risk</CardTitle></CardHeader><CardContent>{!isManager && !isHr ? (!mine?.length ? <EmptyState icon={ShieldAlert} title="No strikes" description="Your active and historical performance strikes will appear here if issued." /> : <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{mine.map((s: any) => <TableRow key={s.id}><TableCell>{new Date(s.issuedAt).toLocaleDateString()}</TableCell><TableCell>{s.reason}</TableCell><TableCell>{s.status}</TableCell></TableRow>)}</TableBody></Table>) : isLoading ? <div className="h-48 animate-pulse rounded-xl bg-muted" /> : !employees?.length ? <EmptyState icon={ShieldAlert} title="No active employees" /> : <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Strikes</TableHead><TableHead>Risk</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{employees.map((e: any) => <TableRow key={e.id}><TableCell><p className="font-medium">{e.firstName} {e.lastName}</p><p className="text-xs text-muted-foreground">{e.employeeCode}</p></TableCell><TableCell>{e.activeStrikes}</TableCell><TableCell><Badge variant={COLOR_VARIANT[e.color] ?? 'secondary'}>{e.color}</Badge></TableCell><TableCell className="text-right">{isHr && e.activeStrikes > 0 && <Button size="sm" variant="ghost" onClick={async () => { const strikes = await api.get<any[]>(`/strikes/employee/${e.id}`); const active = strikes.find((s) => s.status === 'ACTIVE'); if (active) resolve.mutate(active.id); }}>Resolve</Button>}{isHr && e.activeStrikes >= 3 && <Button size="sm" variant="outline" onClick={async () => { const strikes = await api.get<any[]>(`/strikes/employee/${e.id}`); const active = strikes.find((s) => s.status === 'ACTIVE' && !s.pipTaskCreated); if (active) pip.mutate({ id: active.id, employeeId: e.id }); }} disabled={pip.isPending}>Create PIP task</Button>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></AppShell>;
}
