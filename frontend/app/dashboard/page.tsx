'use client';

import { AppShell } from '@/components/layout/app-shell';
import { useAuthStore } from '@/lib/auth-store';
import { EmployeeDashboard } from '@/components/dashboards/employee-dashboard';
import { ManagerDashboard } from '@/components/dashboards/manager-dashboard';
import { HrDashboard } from '@/components/dashboards/hr-dashboard';
import { HiringManagerDashboard } from '@/components/dashboards/hiring-manager-dashboard';
import { LeadershipDashboard } from '@/components/dashboards/leadership-dashboard';

export default function DashboardPage() {
  const primaryRole = useAuthStore((s) => s.primaryRole());

  const DashboardByRole: Record<string, React.ReactNode> = {
    SUPER_ADMIN: <HrDashboard />,
    HR_ADMIN: <HrDashboard />,
    LEADERSHIP: <LeadershipDashboard />,
    MANAGER: <ManagerDashboard />,
    EMPLOYEE: <EmployeeDashboard />,
  };

  return <AppShell title="Dashboard">{DashboardByRole[primaryRole] ?? <EmployeeDashboard />}</AppShell>;
}
