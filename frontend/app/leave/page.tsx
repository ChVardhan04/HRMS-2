'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CheckCircle2, FileHeart, History, Palmtree, Settings2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import {
  useApplyLeave, useApproveHrLeave, useApproveManagerLeave, useCancelLeave,
  useHrLeaveOverview, useLeaveApprovals, useLeaveBalances, useLeaveHistory,
  useLeavePreview, useLeaveTypes, useRejectLeave, useSetLeaveBalance,
} from '@/features/leave/use-leave';
import { useDepartments } from '@/features/employees/use-employees';
import { useAuthStore } from '@/lib/auth-store';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

export default function LeavePage() {
  const now = new Date();
  const isManager = useAuthStore((s)=>s.hasRole('MANAGER'));
  const isHr = useAuthStore((s)=>s.hasRole('HR_ADMIN','SUPER_ADMIN'));
  const { data: types } = useLeaveTypes();
  const { data: balances } = useLeaveBalances();
  const { data: history } = useLeaveHistory();
  const { data: approvals } = useLeaveApprovals(isManager || isHr);
  const { data: departments } = useDepartments();
  const apply = useApplyLeave(); const previewMutation = useLeavePreview();
  const managerApprove = useApproveManagerLeave(); const hrApprove = useApproveHrLeave(); const reject = useRejectLeave(); const cancel = useCancelLeave();
  const setBalance = useSetLeaveBalance(); const qc = useQueryClient(); const { toast } = useToast();

  const [form,setForm] = useState<any>({ leaveTypeId:'',startDate:'',endDate:'',durationType:'FULL_DAY',reason:'',emergencyContact:'',emergencyAddress:'' });
  const [certificate,setCertificate] = useState<File|null>(null);
  const [preview,setPreview] = useState<any>(null);
  const [adminMonth,setAdminMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [departmentId,setDepartmentId] = useState('ALL');
  const adminYear=Number(adminMonth.slice(0,4)); const adminMonthNo=Number(adminMonth.slice(5,7));
  const { data: overview } = useHrLeaveOverview(adminYear,adminMonthNo,isHr,departmentId==='ALL'?'':departmentId);

  const selectedType = types?.find((t:any)=>t.id===form.leaveTypeId);
  const selectedBalance = balances?.find((b:any)=>b.leaveType.id===form.leaveTypeId);
  const update=(k:string,v:any)=>{ setForm((f:any)=>({...f,[k]:v})); setPreview(null); };
  const doPreview=()=>previewMutation.mutate(form,{onSuccess:setPreview});
  const submit=()=>apply.mutate({data:form,medicalCertificate:certificate},{onSuccess:()=>{setForm({leaveTypeId:'',startDate:'',endDate:'',durationType:'FULL_DAY',reason:'',emergencyContact:'',emergencyAddress:''});setCertificate(null);setPreview(null);}});

  const reverse=useMutation({mutationFn:(id:string)=>api.patch(`/leave/${id}/reverse`),onSuccess:()=>{qc.invalidateQueries({queryKey:['leave']});toast({title:'Approved leave reversed',variant:'success'});},onError:(e:any)=>toast({title:'Could not reverse leave',description:e.message,variant:'destructive'})});

  return <AppShell title="Leave Management"><div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {balances?.map((b:any)=><Card key={b.leaveType.id}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{b.leaveType.name}</p><div className="mt-1 flex items-end justify-between"><p className="text-2xl font-semibold">{b.balanceControlled ? Number(b.available).toFixed(1) : '∞'}</p><span className="text-xs text-muted-foreground">{b.balanceControlled ? 'days left' : 'no fixed balance'}</span></div><p className="mt-2 text-xs text-muted-foreground">Used {Number(b.used).toFixed(1)} · Pending {Number(b.pending).toFixed(1)}</p></CardContent></Card>)}
    </div>

    <Tabs defaultValue={isHr ? 'admin' : 'apply'}><TabsList className="flex flex-wrap">{!isHr&&<TabsTrigger value="apply">Apply Leave</TabsTrigger>}<TabsTrigger value="history">My History</TabsTrigger>{(isManager||isHr)&&<TabsTrigger value="approvals">Approvals</TabsTrigger>}{isHr&&<TabsTrigger value="admin">HR Leave Dashboard</TabsTrigger>}</TabsList>
      <TabsContent value="apply"><div className="grid gap-4 lg:grid-cols-3"><Card className="lg:col-span-2"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarPlus className="h-4 w-4 text-primary"/>Leave application</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Leave type *</Label><Select value={form.leaveTypeId} onValueChange={(v)=>update('leaveTypeId',v)}><SelectTrigger><SelectValue placeholder="Select leave type"/></SelectTrigger><SelectContent>{types?.map((t:any)=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>{selectedBalance&&<p className="mt-1 text-xs text-muted-foreground">Available: {selectedBalance.balanceControlled ? Number(selectedBalance.available).toFixed(1) : 'No fixed limit'} day(s)</p>}</div>
          <div><Label>Duration</Label><Select value={form.durationType} onValueChange={(v)=>update('durationType',v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="FULL_DAY">Full day</SelectItem><SelectItem value="FIRST_HALF">First half</SelectItem><SelectItem value="SECOND_HALF">Second half</SelectItem></SelectContent></Select></div>
          <div><Label>From *</Label><Input type="date" value={form.startDate} onChange={(e)=>update('startDate',e.target.value)}/></div>
          <div><Label>To *</Label><Input type="date" value={form.endDate} onChange={(e)=>update('endDate',e.target.value)}/></div>
          <div className="sm:col-span-2"><Label>Genuine reason *</Label><Input value={form.reason} onChange={(e)=>update('reason',e.target.value)} placeholder="Explain the reason for leave"/></div>
          <div><Label>Emergency contact *</Label><Input value={form.emergencyContact} onChange={(e)=>update('emergencyContact',e.target.value)} placeholder="Phone number during leave"/></div>
          <div><Label>Emergency address *</Label><Input value={form.emergencyAddress} onChange={(e)=>update('emergencyAddress',e.target.value)} placeholder="Address/location during leave"/></div>
          <div className="sm:col-span-2"><Label>Medical certificate</Label><Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e)=>setCertificate(e.target.files?.[0]??null)}/><p className="mt-1 text-xs text-muted-foreground">Required automatically for sick leave longer than the configured department limit.</p></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={doPreview} disabled={!form.leaveTypeId||!form.startDate||!form.endDate||previewMutation.isPending}>Calculate leave</Button><Button onClick={submit} disabled={!preview||!form.reason||!form.emergencyContact||!form.emergencyAddress||apply.isPending}>Submit request</Button></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Policy calculation</CardTitle></CardHeader><CardContent>{!preview?<div className="text-sm text-muted-foreground">Select leave dates and click <strong>Calculate leave</strong>. The system will apply department working days, sandwich leave, advance notice and certificate rules before submission.</div>:<div className="space-y-3 text-sm"><Row label="Selected working leave" value={`${preview.appliedWorkingDays} day(s)`}/><Row label="Sandwich days" value={`${preview.sandwichDays} day(s)`}/><Row label="Total chargeable" value={`${preview.chargeableDays} day(s)`}/><Row label="Advance notice" value={`${preview.advanceWorkingDays} working day(s)`}/><Row label="Medical certificate" value={preview.medicalCertificateRequired?'Required':'Not required'}/>{preview.sandwichDates?.length>0&&<div className="rounded-md border bg-muted/40 p-2 text-xs"><strong>Sandwich dates:</strong> {preview.sandwichDates.join(', ')}</div>}</div>}</CardContent></Card></div></TabsContent>

      <TabsContent value="history"><Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4 text-primary"/>My leave history</CardTitle></CardHeader><CardContent>{!history?.length?<EmptyState icon={History} title="No leave requests yet"/>:<Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Dates</TableHead><TableHead>Working</TableHead><TableHead>Sandwich</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead/></TableRow></TableHeader><TableBody>{history.map((h:any)=><TableRow key={h.id}><TableCell>{h.leaveType.name}</TableCell><TableCell>{formatDate(h.startDate)} – {formatDate(h.endDate)}</TableCell><TableCell>{Number(h.appliedWorkingDays ?? h.numberOfDays)}</TableCell><TableCell>{Number(h.sandwichDays??0)}</TableCell><TableCell>{Number(h.numberOfDays)}</TableCell><TableCell><StatusBadge status={h.status}/></TableCell><TableCell className="text-right">{['PENDING','MANAGER_APPROVED'].includes(h.status)&&<Button size="sm" variant="ghost" onClick={()=>cancel.mutate(h.id)}>Cancel</Button>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></TabsContent>

      {(isManager||isHr)&&<TabsContent value="approvals"><Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary"/>{isHr?'HR final approval queue':'Team leave approvals'}</CardTitle></CardHeader><CardContent>{!approvals?.length?<EmptyState icon={CheckCircle2} title="No requests waiting"/>:<div className="divide-y">{approvals.map((r:any)=><div key={r.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-medium">{r.employee.firstName} {r.employee.lastName} · {r.leaveType.name}</p><p className="text-xs text-muted-foreground">{r.employee.employeeCode}{r.employee.department?.name?` · ${r.employee.department.name}`:''} · {formatDate(r.startDate)} – {formatDate(r.endDate)} · {Number(r.numberOfDays)} day(s)</p><p className="mt-1 text-sm">{r.reason}</p>{r.medicalCertificateFileName&&<Button size="sm" variant="link" className="px-0" onClick={async()=>{const x:any=await api.get(`/leave/${r.id}/medical-certificate`);window.open(x.url,'_blank')}}><FileHeart className="mr-1 h-3.5 w-3.5"/>Medical certificate</Button>}</div><div className="flex gap-2"><Button size="sm" onClick={()=>isHr?hrApprove.mutate(r.id):managerApprove.mutate(r.id)}>Approve</Button><Button size="sm" variant="outline" onClick={()=>{const reason=window.prompt('Reason for rejection');if(reason)reject.mutate({id:r.id,reason})}}>Reject</Button></div></div>)}</div>}</CardContent></Card></TabsContent>}

      {isHr&&<TabsContent value="admin"><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary"/>HR leave management</CardTitle><p className="mt-1 text-xs text-muted-foreground">Department-wise monthly leave activity and employee balances.</p></div><div className="flex gap-2"><Select value={departmentId} onValueChange={setDepartmentId}><SelectTrigger className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ALL">All departments</SelectItem>{departments?.map((d:any)=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select><Input type="month" value={adminMonth} onChange={(e)=>setAdminMonth(e.target.value)} className="w-44"/></div></div></CardHeader><CardContent>{!overview?.employees?.length?<EmptyState icon={Palmtree} title="No employees found"/>:<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Balances</TableHead><TableHead>Month activity</TableHead><TableHead>Manage</TableHead></TableRow></TableHeader><TableBody>{overview.employees.map((e:any)=><TableRow key={e.id}><TableCell><p className="font-medium">{e.firstName} {e.lastName}</p><p className="text-xs text-muted-foreground">{e.employeeCode}{e.department?.name?` · ${e.department.name}`:''}</p></TableCell><TableCell><div className="flex flex-wrap gap-1">{e.balances.map((b:any)=><span key={b.leaveType.id} className="rounded border px-2 py-1 text-xs">{b.leaveType.code}: <strong>{b.balanceControlled?Number(b.available).toFixed(1):'∞'}</strong></span>)}</div></TableCell><TableCell>{e.leaves.length?<div className="space-y-1">{e.leaves.slice(0,3).map((l:any)=><div key={l.id} className="text-xs">{l.leaveType.code} · {Number(l.numberOfDays)}d · <StatusBadge status={l.status}/></div>)}</div>:<span className="text-xs text-muted-foreground">No leave</span>}</TableCell><TableCell><BalanceEditor employee={e} year={adminYear} onSave={(x:any)=>setBalance.mutate(x)}/></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card></TabsContent>}
    </Tabs>
  </div></AppShell>;
}

function Row({label,value}:{label:string;value:string}) { return <div className="flex justify-between gap-4 border-b pb-2"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>; }

function BalanceEditor({employee,year,onSave}:{employee:any;year:number;onSave:(x:any)=>void}) {
  const controlled=employee.balances.filter((b:any)=>b.balanceControlled); const [typeId,setTypeId]=useState(controlled[0]?.leaveType.id??'');
  const selected=controlled.find((b:any)=>b.leaveType.id===typeId); const [value,setValue]=useState(selected?String(selected.accrued):'');
  const choose=(id:string)=>{setTypeId(id);const x=controlled.find((b:any)=>b.leaveType.id===id);setValue(x?String(x.accrued):'');};
  if(!controlled.length)return <span className="text-xs text-muted-foreground">No controlled balances</span>;
  return <div className="flex items-center gap-1"><Select value={typeId} onValueChange={choose}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent>{controlled.map((b:any)=><SelectItem key={b.leaveType.id} value={b.leaveType.id}>{b.leaveType.code}</SelectItem>)}</SelectContent></Select><Input className="w-20" type="number" step="0.5" value={value} onChange={(e)=>setValue(e.target.value)}/><Button size="sm" variant="outline" onClick={()=>onSave({employeeId:employee.id,leaveTypeId:typeId,year,accrued:Number(value),carriedForward:Number(selected?.carriedForward??0)})}>Save</Button></div>;
}
