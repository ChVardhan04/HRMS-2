'use client';

import { useState } from 'react';
import { Archive, CheckCircle2, FileText, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, apiFetch } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';

export default function PoliciesPage() {
  const canManage = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const qc = useQueryClient(); const { toast } = useToast();
  const [form, setForm] = useState({ title: '', description: '' }); const [editing, setEditing] = useState<any | null>(null);
  const { data: policies, isLoading } = useQuery({ queryKey: ['policies'], queryFn: () => api.get<any[]>('/policies') });
  const create = useMutation({ mutationFn: () => api.post('/policies', form), onSuccess: () => { setForm({ title: '', description: '' }); qc.invalidateQueries({ queryKey: ['policies'] }); toast({ title: 'Policy published', variant: 'success' }); } });
  const update = useMutation({ mutationFn: () => api.patch(`/policies/${editing.id}`, { title: editing.title, description: editing.description }), onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ['policies'] }); toast({ title: 'Policy updated', variant: 'success' }); } });
  const archive = useMutation({ mutationFn: (id: string) => api.patch(`/policies/${id}/archive`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['policies'] }); toast({ title: 'Policy archived', variant: 'success' }); } });
  const acknowledge = useMutation({ mutationFn: (id: string) => api.post(`/policies/${id}/acknowledge`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['policies'] }); toast({ title: 'Policy acknowledged', variant: 'success' }); } });
  async function uploadFile(id: string, file: File) { const fd = new FormData(); fd.append('file', file); try { await apiFetch(`/policies/${id}/file`, { method: 'POST', body: fd }); qc.invalidateQueries({ queryKey: ['policies'] }); toast({ title: 'Policy version uploaded', variant: 'success' }); } catch (e: any) { toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }); } }
  async function viewFile(id: string) { try { const d = await api.get<any>(`/policies/${id}/download`); window.open(d.url, '_blank', 'noopener,noreferrer'); } catch (e: any) { toast({ title: 'Could not open policy', description: e.message, variant: 'destructive' }); } }

  return <AppShell title="Policies"><div className="mx-auto max-w-5xl space-y-4"><div className="grid gap-4 lg:grid-cols-[340px_1fr]">{canManage && <Card><CardHeader><CardTitle>Publish policy</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}><div><Label>Title</Label><Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><Button type="submit" disabled={create.isPending}>Publish</Button></form></CardContent></Card>}<div className="space-y-3">{isLoading ? <div className="h-64 animate-pulse rounded-xl bg-muted" /> : !policies?.length ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No active policies.</CardContent></Card> : policies.map((p: any) => <Card key={p.id}><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>{p.title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Version {p.version} · {p.effectiveFrom ? new Date(p.effectiveFrom).toLocaleDateString() : 'Effective immediately'}</p></div>{p.acknowledged && <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" /> Acknowledged</Badge>}</div></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">{p.description || 'No description provided.'}</p><div className="flex flex-wrap gap-2">{p.fileName && <Button variant="outline" onClick={() => viewFile(p.id)}><FileText className="mr-2 h-4 w-4" /> View document</Button>}{canManage && <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Upload className="h-4 w-4" /> New version<input hidden type="file" accept="application/pdf,.doc,.docx" onChange={(e) => e.target.files?.[0] && uploadFile(p.id, e.target.files[0])} /></label>}{canManage ? <><Button variant="ghost" onClick={() => setEditing({ ...p })}>Edit</Button><Button variant="ghost" onClick={() => archive.mutate(p.id)}><Archive className="mr-1 h-4 w-4" /> Archive</Button></> : !p.acknowledged && <Button onClick={() => acknowledge.mutate(p.id)}><CheckCircle2 className="mr-2 h-4 w-4" /> Acknowledge v{p.version}</Button>}</div></CardContent></Card>)}</div></div></div><Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Edit policy</DialogTitle></DialogHeader>{editing && <div className="space-y-3"><div><Label>Title</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div><div><Label>Description</Label><Input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => update.mutate()} disabled={update.isPending}>Save new version</Button></DialogFooter></DialogContent></Dialog></AppShell>;
}
