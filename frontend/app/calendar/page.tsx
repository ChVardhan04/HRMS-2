'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Clock3, Plus, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';

const monthName = (month: number) => new Date(2000, month - 1, 1).toLocaleString('en-US', { month: 'long' });

function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function timeToMinutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export default function CalendarPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [optional, setOptional] = useState('false');
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const canManage = useAuthStore((s) => s.hasRole('HR_ADMIN', 'SUPER_ADMIN'));
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useQuery({ queryKey: ['calendar', 'settings'], queryFn: () => api.get<any>('/calendar/settings') });
  const { data: summary } = useQuery({ queryKey: ['calendar', 'summary', month, year], queryFn: () => api.get<any>(`/calendar/summary?month=${month}&year=${year}`) });
  const { data: holidays } = useQuery({ queryKey: ['calendar', 'holidays', year], queryFn: () => api.get<any[]>(`/calendar/holidays?year=${year}`) });
  const addHoliday = useMutation({
    mutationFn: () => api.post('/calendar/holidays', { name, date, isOptional: optional === 'true' }),
    onSuccess: () => { setName(''); setDate(''); setOptional('false'); qc.invalidateQueries({ queryKey: ['calendar'] }); toast({ title: 'Holiday added', variant: 'success' }); },
    onError: (e: any) => toast({ title: 'Could not add holiday', description: e.message, variant: 'destructive' }),
  });
  const updateHoliday = useMutation({
    mutationFn: () => api.patch(`/calendar/holidays/${editingHolidayId}`, { name, date, isOptional: optional === 'true' }),
    onSuccess: () => { setEditingHolidayId(null); setName(''); setDate(''); setOptional('false'); qc.invalidateQueries({ queryKey: ['calendar'] }); toast({ title: 'Holiday updated', variant: 'success' }); },
    onError: (e: any) => toast({ title: 'Could not update holiday', description: e.message, variant: 'destructive' }),
  });
  const deleteHoliday = useMutation({
    mutationFn: (id: string) => api.delete(`/calendar/holidays/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar'] }); toast({ title: 'Holiday removed', variant: 'success' }); },
    onError: (e: any) => toast({ title: 'Could not remove holiday', description: e.message, variant: 'destructive' }),
  });
  const updateSettings = useMutation({
    mutationFn: (payload: any) => api.patch('/calendar/settings', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar'] }); toast({ title: 'Calendar policy saved', variant: 'success' }); },
    onError: (e: any) => toast({ title: 'Could not save policy', description: e.message, variant: 'destructive' }),
  });
  const hours = useMemo(() => settings ? `${minutesToTime(settings.officeStartMinutes)} – ${minutesToTime(settings.officeEndMinutes)}` : '-', [settings]);

  return (
    <AppShell title="Company Calendar">
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Working days</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{summary?.workingDays ?? '-'}</p><p className="text-xs text-muted-foreground">{monthName(month)} {year} · company working days</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Company hours</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{hours}</p><p className="text-xs text-muted-foreground">Lunch {settings ? `${minutesToTime(settings.lunchStartMinutes)} – ${minutesToTime(settings.lunchEndMinutes)}` : '-'} · Attendance call {settings ? `${minutesToTime(settings.attendanceCallStartMinutes)} – ${minutesToTime(settings.attendanceCallEndMinutes)}` : '-'}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Saturday policy</CardTitle></CardHeader><CardContent><p className="text-lg font-semibold">{settings?.saturdayWorkPattern === 'FIRST_THIRD_WORKING' ? '1st & 3rd Saturday working' : settings?.saturdayWorkPattern?.replaceAll('_', ' ') ?? '-'}</p><p className="text-xs text-muted-foreground">Sunday is non-working by default.</p></CardContent></Card>
        </div>

        {canManage && settings && <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /> HR attendance policy</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div><Label>Office start</Label><Input type="time" defaultValue={minutesToTime(settings.officeStartMinutes)} onBlur={(e) => updateSettings.mutate({ officeStartMinutes: timeToMinutes(e.target.value) })} /></div>
            <div><Label>Office end</Label><Input type="time" defaultValue={minutesToTime(settings.officeEndMinutes)} onBlur={(e) => updateSettings.mutate({ officeEndMinutes: timeToMinutes(e.target.value) })} /></div>
            <div><Label>Lunch</Label><div className="flex gap-2"><Input type="time" defaultValue={minutesToTime(settings.lunchStartMinutes)} onBlur={(e) => updateSettings.mutate({ lunchStartMinutes: timeToMinutes(e.target.value) })} /><Input type="time" defaultValue={minutesToTime(settings.lunchEndMinutes)} onBlur={(e) => updateSettings.mutate({ lunchEndMinutes: timeToMinutes(e.target.value) })} /></div></div>
            <div><Label>Saturday pattern</Label><Select value={settings.saturdayWorkPattern} onValueChange={(v) => updateSettings.mutate({ saturdayWorkPattern: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIRST_THIRD_WORKING">1st & 3rd working</SelectItem><SelectItem value="SECOND_FOURTH_WORKING">2nd & 4th working</SelectItem><SelectItem value="ALL_SATURDAYS_WORKING">All working</SelectItem><SelectItem value="ALL_SATURDAYS_OFF">All off</SelectItem></SelectContent></Select></div><div><Label>Timezone</Label><Input defaultValue={settings.timezone} onBlur={(e) => updateSettings.mutate({ timezone: e.target.value })} /></div><div><Label>Absence cutoff</Label><Input type="time" defaultValue={minutesToTime(settings.attendanceAbsenceCutoffMinutes)} onBlur={(e) => updateSettings.mutate({ attendanceAbsenceCutoffMinutes: timeToMinutes(e.target.value) })} /></div><div><Label>DPR SLA</Label><Input type="time" defaultValue={minutesToTime(settings.dprSlaMinutes)} onBlur={(e) => updateSettings.mutate({ dprSlaMinutes: timeToMinutes(e.target.value) })} /></div><div><Label>DPR reminder 1</Label><Input type="time" defaultValue={minutesToTime(settings.dprReminder1Minutes)} onBlur={(e) => updateSettings.mutate({ dprReminder1Minutes: timeToMinutes(e.target.value) })} /></div><div><Label>DPR reminder 2</Label><Input type="time" defaultValue={minutesToTime(settings.dprReminder2Minutes)} onBlur={(e) => updateSettings.mutate({ dprReminder2Minutes: timeToMinutes(e.target.value) })} /></div><div><Label>KRA strike threshold</Label><Input type="number" min="1" max="100" defaultValue={settings.kraStrikeThresholdScore} onBlur={(e) => updateSettings.mutate({ kraStrikeThresholdScore: Number(e.target.value) })} /></div><div><Label>Strike window (months)</Label><Input type="number" min="1" max="24" defaultValue={settings.kraRollingWindowMonths} onBlur={(e) => updateSettings.mutate({ kraRollingWindowMonths: Number(e.target.value) })} /></div><div><Label>Strike escalation count</Label><Input type="number" min="1" max="10" defaultValue={settings.kraStrikesToEscalate} onBlur={(e) => updateSettings.mutate({ kraStrikesToEscalate: Number(e.target.value) })} /></div>
          </CardContent>
        </Card>}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>{monthName(month)} {year}</CardTitle><div className="flex gap-2"><Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i+1} value={String(i+1)}>{monthName(i+1)}</SelectItem>)}</SelectContent></Select><Input className="w-24" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div></CardHeader>
            <CardContent><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Day</TableHead><TableHead>Type</TableHead><TableHead>Holiday</TableHead></TableRow></TableHeader><TableBody>{summary?.days?.map((d: any) => <TableRow key={d.date}><TableCell>{d.date}</TableCell><TableCell>{d.day}</TableCell><TableCell><Badge variant={d.working ? 'success' : 'muted'}>{d.type.replace('_',' ')}</Badge></TableCell><TableCell>{d.holiday ?? '-'}</TableCell></TableRow>)}</TableBody></Table></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Company holidays {year}</CardTitle></CardHeader>
            <CardContent>
              {canManage && <form className="mb-5 grid gap-3 rounded-lg border p-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (editingHolidayId) updateHoliday.mutate(); else addHoliday.mutate(); }}><div><Label>Holiday name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Company holiday" /></div><div><Label>Date</Label><Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div><div><Label>Holiday type</Label><Select value={optional} onValueChange={setOptional}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="false">Company holiday</SelectItem><SelectItem value="true">Optional holiday</SelectItem></SelectContent></Select></div><div className="flex items-end"><Button type="submit" disabled={addHoliday.isPending || updateHoliday.isPending}><Plus className="h-4 w-4" /> {editingHolidayId ? 'Save holiday' : 'Add holiday'}</Button></div></form>}
              <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>{canManage && <TableHead />}</TableRow></TableHeader><TableBody>{holidays?.map((h: any) => <TableRow key={h.id}><TableCell>{h.date.slice(0,10)}</TableCell><TableCell>{h.name}</TableCell><TableCell><Badge variant={h.isOptional ? 'outline' : 'secondary'}>{h.isOptional ? 'Optional' : 'Company holiday'}</Badge></TableCell>{canManage && <TableCell className="text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => { setEditingHolidayId(h.id); setName(h.name); setDate(h.date.slice(0,10)); setOptional(String(Boolean(h.isOptional))); }}>Edit</Button><Button size="icon" variant="ghost" onClick={() => deleteHoliday.mutate(h.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell>}</TableRow>)}</TableBody></Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
