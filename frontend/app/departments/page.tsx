'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, Clock3, Plus, Save, Users, Target, Palmtree, BriefcaseBusiness } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateDepartment, useDepartment, useDepartments, useCreateDesignation, useUpdateDepartmentLeavePolicy, useUpdateDepartmentPolicy } from '@/features/departments/use-departments';

const mins = (v: string) => { const [h,m] = v.split(':').map(Number); return h * 60 + m; };
const time = (v: number) => `${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;
const weekdays = [
  ['mondayWorking','Monday'],['tuesdayWorking','Tuesday'],['wednesdayWorking','Wednesday'],['thursdayWorking','Thursday'],['fridayWorking','Friday'],['sundayWorking','Sunday'],
] as const;

export default function DepartmentsPage() {
  const now = new Date();
  const [selectedId, setSelectedId] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [month, setMonth] = useState(now.getMonth()+1);
  const [year] = useState(now.getFullYear());
  const { data: departments } = useDepartments();
  const { data: department } = useDepartment(selectedId, month, year);
  const create = useCreateDepartment();
  const savePolicy = useUpdateDepartmentPolicy(selectedId);
  const saveLeave = useUpdateDepartmentLeavePolicy(selectedId);
  const createDesignation = useCreateDesignation();
  const [designationTitle, setDesignationTitle] = useState('');
  const [policy, setPolicy] = useState<any>(null);

  useEffect(() => { if (!selectedId && departments?.[0]?.id) setSelectedId(departments[0].id); }, [departments, selectedId]);
  useEffect(() => { if (department?.policy) setPolicy({ ...department.policy }); }, [department]);

  const summary = department?.summary;
  const leavePolicies = department?.leavePolicies ?? [];

  return <AppShell title="Departments & HR Rules">
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Department administration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={selectedId} onValueChange={setSelectedId}><SelectTrigger className="w-64"><SelectValue placeholder="Select department" /></SelectTrigger><SelectContent>{departments?.map((d:any)=><SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
            <Input className="w-64" value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="New department name" />
            <Button onClick={()=>{ if(newName.trim()) create.mutate(newName.trim(), { onSuccess: ()=>setNewName('') }); }} disabled={!newName.trim() || create.isPending}><Plus className="h-4 w-4" /> Add Department</Button>
          </div>
        </CardContent>
      </Card>

      {department && <>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            ['Employees',summary?.employees ?? 0,Users],['Present Today',summary?.presentToday ?? 0,Clock3],['Absent Today',summary?.absentToday ?? 0,Clock3],['On Leave',summary?.leaveToday ?? 0,Palmtree],['Pending Leave',summary?.pendingLeaves ?? 0,CalendarDays],['Avg KRA',summary?.averageKra == null ? '-' : `${Number(summary.averageKra).toFixed(1)}%`,Target],
          ].map(([label,value,Icon]:any)=><Card key={label}><CardContent className="p-4"><Icon className="mb-2 h-4 w-4 text-primary"/><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></CardContent></Card>)}
        </div>

        <Tabs defaultValue="attendance">
          <TabsList className="flex flex-wrap"><TabsTrigger value="attendance">Attendance & Working Days</TabsTrigger><TabsTrigger value="leave">Leave Rules</TabsTrigger><TabsTrigger value="designations">Designations</TabsTrigger><TabsTrigger value="overview">Department Details</TabsTrigger></TabsList>
          <TabsContent value="attendance">
            <Card><CardHeader><CardTitle>Attendance & working-day policy</CardTitle></CardHeader><CardContent>
              {!policy ? <div className="h-40 animate-pulse rounded bg-muted"/> : <div className="space-y-6">
                <div><Label className="mb-2 block">Working days</Label><div className="flex flex-wrap gap-2">{weekdays.map(([key,label])=><Button type="button" key={key} variant={policy[key] ? 'default' : 'outline'} onClick={()=>setPolicy((p:any)=>({...p,[key]:!p[key]}))}>{label}</Button>)}</div></div>
                <div className="max-w-sm"><Label>Saturday working pattern</Label><Select value={policy.saturdayWorkPattern ?? 'FIRST_THIRD_WORKING'} onValueChange={(v)=>setPolicy((p:any)=>({...p,saturdayWorkPattern:v}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIRST_THIRD_WORKING">1st & 3rd Saturday working</SelectItem><SelectItem value="SECOND_FOURTH_WORKING">2nd & 4th Saturday working</SelectItem><SelectItem value="ALL_SATURDAYS_WORKING">All Saturdays working</SelectItem><SelectItem value="ALL_SATURDAYS_OFF">All Saturdays off</SelectItem></SelectContent></Select></div>
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                  {[['officeStartMinutes','Office starts'],['officeEndMinutes','Office ends'],['lunchStartMinutes','Lunch starts'],['lunchEndMinutes','Lunch ends'],['checkInOpenMinutes','Check-in opens'],['lateAfterMinutes','Late after'],['halfDayAfterMinutes','Half-day after'],['checkInCutoffMinutes','Check-in closes'],['autoAbsentMinutes','Auto-absent at']].map(([key,label])=><div key={key}><Label>{label}</Label><Input type="time" value={time(Number(policy[key]))} onChange={(e)=>setPolicy((p:any)=>({...p,[key]:mins(e.target.value)}))}/></div>)}
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <div><Label>Allowed lates / month</Label><Input type="number" min="0" value={policy.allowedLatesPerMonth} onChange={(e)=>setPolicy((p:any)=>({...p,allowedLatesPerMonth:Number(e.target.value)}))}/></div>
                  <div><Label>1st late deduction</Label><Input type="number" step="0.25" min="0" value={policy.firstLatePenaltyDays} onChange={(e)=>setPolicy((p:any)=>({...p,firstLatePenaltyDays:Number(e.target.value)}))}/></div>
                  <div><Label>2nd late deduction</Label><Input type="number" step="0.25" min="0" value={policy.secondLatePenaltyDays} onChange={(e)=>setPolicy((p:any)=>({...p,secondLatePenaltyDays:Number(e.target.value)}))}/></div>
                  <div><Label>3rd+ late deduction</Label><Input type="number" step="0.25" min="0" value={policy.thirdPlusLatePenaltyDays} onChange={(e)=>setPolicy((p:any)=>({...p,thirdPlusLatePenaltyDays:Number(e.target.value)}))}/></div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <div><Label>Sandwich leave</Label><Select value={String(Boolean(policy.sandwichLeaveEnabled))} onValueChange={(v)=>setPolicy((p:any)=>({...p,sandwichLeaveEnabled:v==='true'}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">Enabled</SelectItem><SelectItem value="false">Disabled</SelectItem></SelectContent></Select></div>
                  <div><Label>Include previous working day</Label><Select value={String(Boolean(policy.sandwichIncludesPreviousWorkingDay))} onValueChange={(v)=>setPolicy((p:any)=>({...p,sandwichIncludesPreviousWorkingDay:v==='true'}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select></div>
                  <div><Label>Probation monthly leave limit</Label><Input type="number" step="0.5" value={policy.probationMonthlyLeaveLimit} onChange={(e)=>setPolicy((p:any)=>({...p,probationMonthlyLeaveLimit:Number(e.target.value)}))}/></div>
                  <div><Label>Probation max days/request</Label><Input type="number" step="0.5" value={policy.probationMaxDaysPerRequest} onChange={(e)=>setPolicy((p:any)=>({...p,probationMaxDaysPerRequest:Number(e.target.value)}))}/></div>
                </div>
                <Button onClick={()=>savePolicy.mutate({ ...Object.fromEntries(Object.entries(policy).filter(([key]) => !['id','departmentId','createdAt','updatedAt'].includes(key))) })} disabled={savePolicy.isPending}><Save className="h-4 w-4"/> Save Department Policy</Button>
              </div>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="leave"><Card><CardHeader><CardTitle>Leave policy by type</CardTitle></CardHeader><CardContent>
            <Table><TableHeader><TableRow><TableHead>Leave Type</TableHead><TableHead>Annual Entitlement</TableHead><TableHead>Balance</TableHead><TableHead>Advance Notice</TableHead><TableHead>Post Approval</TableHead><TableHead>Medical Cert After</TableHead><TableHead>Sandwich</TableHead><TableHead /></TableRow></TableHeader><TableBody>
              {leavePolicies.map((lp:any)=><LeavePolicyRow key={lp.id} row={lp} onSave={(payload:any)=>saveLeave.mutate(payload)} />)}
            </TableBody></Table>
          </CardContent></Card></TabsContent>

          <TabsContent value="designations"><Card><CardHeader><CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-primary"/> Designations</CardTitle></CardHeader><CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">HR can create new designations for this department. New designations immediately become available in the employee master for employees assigned to this department.</p>
            <div className="flex max-w-xl gap-2"><Input value={designationTitle} onChange={(e)=>setDesignationTitle(e.target.value)} placeholder="e.g. Senior HR Executive"/><Button disabled={!designationTitle.trim() || createDesignation.isPending} onClick={()=>createDesignation.mutate({title:designationTitle.trim(),departmentId:selectedId},{onSuccess:()=>setDesignationTitle('')})}><Plus className="h-4 w-4"/> Add designation</Button></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{department.designations?.map((d:any)=><div key={d.id} className="rounded-lg border p-3 text-sm font-medium">{d.title}</div>)}{!department.designations?.length&&<p className="text-sm text-muted-foreground">No designations created for this department yet.</p>}</div>
          </CardContent></Card></TabsContent>

          <TabsContent value="overview"><Card><CardHeader><CardTitle>{department.name} details</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex gap-3"><Select value={String(month)} onValueChange={(v)=>setMonth(Number(v))}><SelectTrigger className="w-44"><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:12},(_,i)=><SelectItem key={i+1} value={String(i+1)}>{new Date(2026,i,1).toLocaleString('en-US',{month:'long'})}</SelectItem>)}</SelectContent></Select></div><div><p className="text-sm font-medium">Designations</p><div className="mt-2 flex flex-wrap gap-2">{department.designations?.length ? department.designations.map((d:any)=><span key={d.id} className="rounded-full border px-3 py-1 text-sm">{d.title}</span>) : <span className="text-sm text-muted-foreground">No designations configured yet.</span>}</div></div></CardContent></Card></TabsContent>
        </Tabs>
      </>}
    </div>
  </AppShell>;
}

function LeavePolicyRow({ row, onSave }: { row:any; onSave:(payload:any)=>void }) {
  const [v,setV] = useState<any>({ ...row, annualEntitlement:Number(row.annualEntitlement), medicalCertificateAfterDays:row.medicalCertificateAfterDays == null ? '' : Number(row.medicalCertificateAfterDays) });
  return <TableRow>
    <TableCell><p className="font-medium">{row.leaveType.name}</p><p className="text-xs text-muted-foreground">{row.leaveType.code}</p></TableCell>
    <TableCell><Input className="w-24" type="number" step="0.5" value={v.annualEntitlement} onChange={(e)=>setV({...v,annualEntitlement:Number(e.target.value)})}/></TableCell>
    <TableCell><Select value={String(Boolean(v.requiresBalance))} onValueChange={(x)=>setV({...v,requiresBalance:x==='true'})}><SelectTrigger className="w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">Required</SelectItem><SelectItem value="false">Unlimited</SelectItem></SelectContent></Select></TableCell>
    <TableCell><Input className="w-20" type="number" value={v.advanceNoticeWorkingDays} onChange={(e)=>setV({...v,advanceNoticeWorkingDays:Number(e.target.value)})}/></TableCell>
    <TableCell><Select value={String(Boolean(v.allowPostApproval))} onValueChange={(x)=>setV({...v,allowPostApproval:x==='true'})}><SelectTrigger className="w-24"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select></TableCell>
    <TableCell><Input className="w-24" type="number" step="0.5" placeholder="None" value={v.medicalCertificateAfterDays} onChange={(e)=>setV({...v,medicalCertificateAfterDays:e.target.value === '' ? undefined : Number(e.target.value)})}/></TableCell>
    <TableCell><Select value={String(Boolean(v.sandwichApplies))} onValueChange={(x)=>setV({...v,sandwichApplies:x==='true'})}><SelectTrigger className="w-24"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select></TableCell>
    <TableCell><Button size="sm" variant="outline" onClick={()=>onSave({ leaveTypeId:row.leaveTypeId, annualEntitlement:Number(v.annualEntitlement), monthlyEntitlement:v.monthlyEntitlement == null ? undefined : Number(v.monthlyEntitlement), requiresBalance:Boolean(v.requiresBalance), advanceNoticeWorkingDays:Number(v.advanceNoticeWorkingDays), allowPostApproval:Boolean(v.allowPostApproval), medicalCertificateAfterDays:v.medicalCertificateAfterDays === '' ? undefined : v.medicalCertificateAfterDays, sandwichApplies:Boolean(v.sandwichApplies), maxConsecutiveDays:v.maxConsecutiveDays == null ? undefined : Number(v.maxConsecutiveDays), active:v.active ?? true })}><Save className="h-3.5 w-3.5"/></Button></TableCell>
  </TableRow>;
}
