'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, History, MessagesSquare, Plus, RefreshCw, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function GroupMonitorPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', platform: 'WHATSAPP', inviteLink: '' });
  const [notes, setNotes] = useState('');
  const [escalated, setEscalated] = useState('false');
  const { data: groups, isLoading } = useQuery({ queryKey: ['groups'], queryFn: () => api.get<any[]>('/groups') });
  const { data: history } = useQuery({ queryKey: ['group-history', historyId], queryFn: () => api.get<any[]>(`/groups/${historyId}/history`), enabled: Boolean(historyId) });
  const create = useMutation({ mutationFn: () => api.post('/groups', form), onSuccess: () => { setShowCreate(false); setForm({ name: '', platform: 'WHATSAPP', inviteLink: '' }); qc.invalidateQueries({ queryKey: ['groups'] }); toast({ title: 'Group registered', variant: 'success' }); } });
  const checkGroup = useMutation({ mutationFn: (id: string) => api.post(`/groups/${id}/check`, { notes, escalated: escalated === 'true', escalationNote: escalated === 'true' ? notes : undefined }), onSuccess: () => { setNotes(''); setEscalated('false'); qc.invalidateQueries({ queryKey: ['groups'] }); toast({ title: 'Group check recorded', variant: 'success' }); } });
  const sync = useMutation({ mutationFn: (id: string) => api.post(`/groups/${id}/sync-members`, {}), onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ['groups'] }); toast({ title: 'Membership sync complete', description: data.flaggedExEmployees?.length ? `${data.flaggedExEmployees.length} ex-employee(s) flagged.` : 'No ex-employees found.', variant: data.flaggedExEmployees?.length ? 'destructive' : 'success' }); } });

  return <AppShell title="Group Monitor"><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3"><Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Active groups</p><p className="mt-1 text-2xl font-semibold">{groups?.length ?? '-'}</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Pending today</p><p className="mt-1 text-2xl font-semibold">{groups?.filter((g: any) => !g.checkLogs?.[0] || new Date(g.checkLogs[0].checkedAt).toDateString() !== new Date().toDateString()).length ?? '-'}</p></CardContent></Card><Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs text-muted-foreground">Daily workflow</p><p className="mt-1 font-medium">Check · sync · escalate</p></div><Button size="sm" onClick={() => setShowCreate(true)}><Plus className="mr-1 h-4 w-4" /> Register</Button></CardContent></Card></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessagesSquare className="h-4 w-4 text-primary" /> Communication groups</CardTitle></CardHeader><CardContent>{isLoading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : !groups?.length ? <EmptyState icon={MessagesSquare} title="No groups registered" description="Register WhatsApp, Teams or Slack groups so the daily check has an audit trail." /> : <div className="divide-y">{groups.map((g: any) => { const last = g.checkLogs?.[0]; const checkedToday = last && new Date(last.checkedAt).toDateString() === new Date().toDateString(); return <div key={g.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{g.name}</p><Badge variant="outline">{g.platform}</Badge>{checkedToday ? <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Checked</Badge> : <Badge variant="warning">Pending</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">Owner: {g.owner?.firstName} {g.owner?.lastName} · {g.members?.length ?? 0} members · Last check {last ? formatDateTime(last.checkedAt) : 'never'}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setHistoryId(g.id); }}><History className="mr-1 h-4 w-4" /> History</Button><Button size="sm" variant="outline" onClick={() => sync.mutate(g.id)}><RefreshCw className="mr-1 h-4 w-4" /> Sync members</Button><Button size="sm" onClick={() => checkGroup.mutate(g.id)} disabled={checkGroup.isPending}><CheckCircle2 className="mr-1 h-4 w-4" /> Mark checked</Button></div></div>})}</div>}</CardContent></Card></div>
    <Dialog open={showCreate} onOpenChange={setShowCreate}><DialogContent><DialogHeader><DialogTitle>Register communication group</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}><div><Label>Group name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div><Label>Platform</Label><Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="WHATSAPP">WhatsApp</SelectItem><SelectItem value="TEAMS">Teams</SelectItem><SelectItem value="SLACK">Slack</SelectItem><SelectItem value="OTHER">Other</SelectItem></SelectContent></Select></div><div><Label>Invite link</Label><Input value={form.inviteLink} onChange={(e) => setForm({ ...form, inviteLink: e.target.value })} /></div><Button type="submit" disabled={create.isPending}>Register group</Button></form></DialogContent></Dialog>
    <Dialog open={Boolean(historyId)} onOpenChange={(open) => !open && setHistoryId(null)}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Check history</DialogTitle></DialogHeader>{!history?.length ? <p className="text-sm text-muted-foreground">No checks recorded yet.</p> : <div className="max-h-96 overflow-y-auto divide-y">{history.map((h: any) => <div key={h.id} className="py-3 text-sm"><div className="flex justify-between gap-3"><span>{h.checkedBy?.firstName} {h.checkedBy?.lastName}</span><span className="text-xs text-muted-foreground">{formatDateTime(h.checkedAt)}</span></div><p className="mt-1 text-muted-foreground">{h.notes || 'No notes'} {h.escalated && <Badge variant="destructive" className="ml-2">Escalated</Badge>}</p></div>)}</div>}</DialogContent></Dialog>
  </AppShell>;
}
