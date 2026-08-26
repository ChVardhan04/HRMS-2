'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Target, Pencil } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { KraSummaryCard } from '@/components/kra/kra-summary-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { useAuthStore } from '@/lib/auth-store';
import { useTeamKraScores } from '@/features/kra/use-kra';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export default function KraPage() {
  const hasRole = useAuthStore((s) => s.hasRole);
  const canScore = hasRole('MANAGER', 'HR_ADMIN', 'SUPER_ADMIN');
  const isHr = hasRole('HR_ADMIN', 'SUPER_ADMIN');
  const { data: team } = useTeamKraScores(undefined, undefined, canScore);
  const qc = useQueryClient();
  const { toast } = useToast();
  const now = new Date();
  const [selected, setSelected] = useState<any | null>(null);
  const [score, setScore] = useState('70');
  const [itemName, setItemName] = useState('COLLABORATION');
  const manual = useMutation({ mutationFn: () => api.post(`/kra/employee/${selected.id}/manual-score`, { itemName, month: now.getMonth() + 1, year: now.getFullYear(), score: Number(score) }), onSuccess: () => { setSelected(null); qc.invalidateQueries({ queryKey: ['kra'] }); toast({ title: 'KRA score saved', variant: 'success' }); }, onError: (e: any) => toast({ title: 'Could not save score', description: e.message, variant: 'destructive' }) });
  return <AppShell title="KRA & Performance"><div className="space-y-4"><div className="mx-auto w-full max-w-xl"><KraSummaryCard /></div>{canScore && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Team KRA · {now.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</CardTitle></CardHeader><CardContent>{!team?.length ? <EmptyState icon={Target} title="No calculated scores yet" description="Scores are calculated from attendance, tasks and DPR data." /> : <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Score</TableHead><TableHead>Status</TableHead>{canScore && <TableHead className="text-right">Actions</TableHead>}</TableRow></TableHeader><TableBody>{team.map((s: any) => <TableRow key={s.id}><TableCell><p className="font-medium">{s.employee.firstName} {s.employee.lastName}</p><p className="text-xs text-muted-foreground">{s.employee.employeeCode}</p></TableCell><TableCell>{Number(s.finalScore).toFixed(1)}%</TableCell><TableCell>{s.isFinal ? 'Final' : 'Projected'}</TableCell>{canScore && <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => { setSelected(s.employee); setScore(String(s.breakdown?.COLLABORATION?.manualScore ?? 70)); }} disabled={s.isFinal && !isHr}><Pencil className="mr-1 h-3.5 w-3.5" /> Score</Button></TableCell>}</TableRow>)}</TableBody></Table>}</CardContent></Card>}</div><Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent><DialogHeader><DialogTitle>Manual KRA score</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{selected?.firstName} {selected?.lastName}</p><div><Label>Metric</Label><Input value={itemName} onChange={(e) => setItemName(e.target.value.toUpperCase())} placeholder="COLLABORATION" /></div><div><Label>Achievement percentage</Label><Input type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button><Button onClick={() => manual.mutate()} disabled={manual.isPending}>Save score</Button></DialogFooter></DialogContent></Dialog></AppShell>;
}
