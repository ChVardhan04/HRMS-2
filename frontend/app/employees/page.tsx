'use client';

import { Suspense, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, Users, UserX, UserCheck, Trash2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import {
  useCreateEmployee,
  useDepartments,
  useEmployees,
  useDeactivateEmployee,
  useDeleteEmployee,
  useReactivateEmployee,
} from '@/features/employees/use-employees';
import { initials } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';

const emptyForm = {
  email: '',
  personalEmail: '',
  firstName: '',
  lastName: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  emergencyContact: '',
  emergencyAddress: '',
  dateOfJoining: new Date().toISOString().slice(0, 10),
  employmentType: 'FULL_TIME',
  departmentId: '',
  designationId: '',
  managerId: '',
  skipLevelManagerId: '',
  location: '',
  monthlySalary: '',
  salaryCurrency: 'INR',
  payrollEligible: true,
  roleNames: ['EMPLOYEE'],
};

const roleOptions = [
  ['EMPLOYEE', 'Employee'],
  ['MANAGER', 'Manager'],
  ['LEADERSHIP', 'Leadership'],
];

function EmployeesContent() {
  const [search, setSearch] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialPage = Math.max(
    1,
    Number(searchParams.get('page') ?? '1') || 1
  );

  const [page, setPageState] = useState(initialPage);
  const setPage = (next: number | ((current: number) => number)) => {
    setPageState((current) => {
      const value =
        typeof next === 'function' ? next(current) : next;

      const params = new URLSearchParams(searchParams.toString());

      if (value <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(value));
      }

      router.replace(
        `${pathname}${params.toString() ? `?${params.toString()}` : ''}`,
        { scroll: false }
      );

      return value;
    });
  };

  const [includeExited, setIncludeExited] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [actionEmployee, setActionEmployee] = useState<any>(null);
  const [actionType, setActionType] = useState<
    'deactivate' | 'reactivate' | 'delete' | null
  >(null);

  const { data, isLoading } = useEmployees(
    search,
    20,
    page,
    includeExited
  );

  const { data: departments } = useDepartments();
  const { data: managers } = useEmployees('', 100, 1, false);

  const createEmployee = useCreateEmployee();

  const canManage = useAuthStore((s) =>
    s.hasRole('HR_ADMIN', 'SUPER_ADMIN')
  );

  const selectedDepartment = useMemo(
    () =>
      departments?.find(
        (d: any) => d.id === form.departmentId
      ),
    [departments, form.departmentId]
  );

  const update = (key: string, value: string) =>
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === 'departmentId'
        ? { designationId: '' }
        : {}),
    }));

  const deactivate = useDeactivateEmployee(
    actionEmployee?.id ?? ''
  );
  const reactivate = useReactivateEmployee(
    actionEmployee?.id ?? ''
  );
  const remove = useDeleteEmployee(
    actionEmployee?.id ?? ''
  );

  const closeAction = () => {
    setActionEmployee(null);
    setActionType(null);
  };

  const doAction = () => {
    if (!actionEmployee || !actionType) return;

    if (actionType === 'deactivate') {
      deactivate.mutate(actionEmployee.id, {
        onSuccess: () => closeAction(),
      });
    }

    if (actionType === 'reactivate') {
      reactivate.mutate(actionEmployee.id, {
        onSuccess: () => closeAction(),
      });
    }

    if (actionType === 'delete') {
      remove.mutate(actionEmployee.id, {
        onSuccess: () => closeAction(),
      });
    }
  };

  return (
    <AppShell title="Employees">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Employee directory
          </CardTitle>

          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by name, code, email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setIncludeExited((v) => !v);
                setPage(1);
              }}
            >
              {includeExited ? 'Active only' : 'Show inactive'}
            </Button>

            {canManage && (
              <Button
                onClick={() => {
                  setForm({ ...emptyForm });
                  setOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add employee
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-md bg-muted" />
          ) : !data?.data?.length ? (
            <EmptyState
              icon={Users}
              title="No employees found"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Employment</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && (
                      <TableHead className="text-right">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {data.data.map((emp: any) => (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <Link
                          href={`/employees/${emp.id}`}
                          className="flex items-center gap-2"
                        >
                          <Avatar className="h-7 w-7">
                            <AvatarFallback>
                              {initials(
                                emp.firstName,
                                emp.lastName
                              )}
                            </AvatarFallback>
                          </Avatar>

                          <div>
                            <p className="text-sm font-medium">
                              {emp.firstName} {emp.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {emp.employeeCode}
                            </p>
                          </div>
                        </Link>
                      </TableCell>

                      <TableCell>
                        {emp.department?.name ?? '-'}
                      </TableCell>

                      <TableCell>
                        {emp.designation?.title ?? '-'}
                      </TableCell>

                      <TableCell>
                        {emp.manager
                          ? `${emp.manager.firstName} ${emp.manager.lastName}`
                          : '-'}
                      </TableCell>

                      <TableCell>
                        {String(
                          emp.employmentType ?? 'FULL_TIME'
                        ).replace('_', ' ')}
                      </TableCell>

                      <TableCell>
                        {emp.user?.mustChangePassword ? (
                          <StatusBadge status="PENDING" />
                        ) : (
                          <StatusBadge status="ACTIVE" />
                        )}
                      </TableCell>

                      <TableCell>
                        <StatusBadge
                          status={emp.employmentStatus}
                        />
                      </TableCell>

                      {canManage && (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {emp.employmentStatus === 'EXITED' ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Reactivate employee"
                                onClick={() => {
                                  setActionEmployee(emp);
                                  setActionType('reactivate');
                                }}
                              >
                                <UserCheck className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Deactivate employee"
                                onClick={() => {
                                  setActionEmployee(emp);
                                  setActionType('deactivate');
                                }}
                              >
                                <UserX className="h-4 w-4" />
                              </Button>
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              title="Delete employee"
                              onClick={() => {
                                setActionEmployee(emp);
                                setActionType('delete');
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data?.meta?.totalPages > 1 && (
            <div className="mt-4 flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">
                Page {data.meta.page} of {data.meta.totalPages} ·{' '}
                {data.meta.total} employees
              </span>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((p) => p - 1)
                  }
                >
                  Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    page >= data.meta.totalPages
                  }
                  onClick={() =>
                    setPage((p) => p + 1)
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keep your existing Add Employee Dialog here unchanged. */}
      {/* Keep your existing action confirmation Dialog here unchanged. */}
    </AppShell>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div>Loading employees...</div>}>
      <EmployeesContent />
    </Suspense>
  );
}
