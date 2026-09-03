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
        <p className="text-xs text-muted-foreground">
          Your available paid leave, approved usage, and pending requests for this year.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-20 animate-pulse rounded-md bg-muted" />
        ) : !balances?.length ? (
          <EmptyState icon={CalendarDays} title="No leave types configured yet" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {balances.map((b: any) => {
              const controlled = b.balanceControlled;
              return (
                <div
                  key={b.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{b.leaveType.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.leaveType.code}
                      </p>
                    </div>
                    <span className="text-lg font-semibold">
                      {controlled
                        ? Number(b.available ?? 0).toFixed(1)
                        : '—'}
                    </span>
                  </div>

                  {controlled ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>
                        Used:{' '}
                        <strong className="text-foreground">
                          {Number(b.used).toFixed(1)}
                        </strong>
                      </span>
                      <span>
                        Pending:{' '}
                        <strong className="text-foreground">
                          {Number(b.pending).toFixed(1)}
                        </strong>
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No balance required for this leave type.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
