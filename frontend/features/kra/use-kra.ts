'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
export function useMyKraScores(){return useQuery({queryKey:['kra','me'],queryFn:()=>api.get<any[]>('/kra/me')});}
export function useMyKraTemplate(){return useQuery({queryKey:['kra','my-template'],queryFn:()=>api.get<any>('/kra/my-template')});}
export function useEmployeeKraTemplate(employeeId?:string){return useQuery({queryKey:['kra','employee-template',employeeId],queryFn:()=>api.get<any>(`/kra/employee/${employeeId}/template`),enabled:!!employeeId});}
export function useTeamKraScores(month?:number,year?:number,enabled=true,departmentId=''){return useQuery({queryKey:['kra','team',month,year,departmentId],queryFn:()=>api.get<any[]>(`/kra/team?month=${month??''}&year=${year??''}${departmentId?`&departmentId=${departmentId}`:''}`),enabled});}
export function useKraTemplates(departmentId='',enabled=true){return useQuery({queryKey:['kra','templates',departmentId],queryFn:()=>api.get<any[]>(`/kra/templates${departmentId?`?departmentId=${departmentId}`:''}`),enabled});}
export function useStrikeDashboard(){return useQuery({queryKey:['strikes','dashboard'],queryFn:()=>api.get<any[]>('/strikes/dashboard')});}
export function useMyStrikes(){return useQuery({queryKey:['strikes','me'],queryFn:()=>api.get<any[]>('/strikes/me')});}

export function useMyDailyKra(month?:number, year?:number){return useQuery({queryKey:['kra','daily','me',month,year],queryFn:()=>api.get<any[]>(`/kra/daily/me?month=${month??''}&year=${year??''}`)});}
export function useGenerateKraMetrics(){return useMutation({mutationFn:(payload:{roleName:string;roleProfile:string})=>api.post<any>('/kra/generate-metrics',payload)});}
export function useConfigureKraTemplate(){return useMutation({mutationFn:(payload:{departmentId:string;designationId:string;roleName:string;roleProfile:string})=>api.post<any>('/kra/templates/configure',payload)});}
