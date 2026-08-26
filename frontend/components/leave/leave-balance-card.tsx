'use client';

import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { useLeaveBalances } from '@/features/leave/use-leave';

export function LeaveBalanceCard() {
  const { data: balances, isLoading } = useLeaveBalances();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" /> Leave Balance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : !balances?.length ? (
          <EmptyState icon={CalendarDays} title="No balances configured yet" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {balances.map((b: any) => {
              const available = Number(b.accrued) + Number(b.carriedForward) - Number(b.used);
              return (
                <div key={b.id} className="rounded-lg border border-border p-3 text-center">
                  <p className="text-lg font-semibold">{available.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">{b.leaveType.code}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
