'use client';

import { Clock, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  useCheckIn,
  useCheckOut,
  useTodayWorkDay,
} from '@/features/workday/use-workday';
import { formatDateTime } from '@/lib/utils';
import { useTodoEodStatus } from '@/features/todos/use-todos';

export function CheckInWidget() {
  const { data: workDay, isLoading } = useTodayWorkDay();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const { data: eod } = useTodoEodStatus();

  const hasPendingTasks = (eod?.pending ?? 0) > 0;

  const dprReady = ['SUBMITTED', 'APPROVED'].includes(
    workDay?.dprStatus ?? '',
  );

  const checkoutBlocked =
    !workDay?.checkInAt ||
    !!workDay?.checkOutAt ||
    checkOut.isPending ||
    hasPendingTasks ||
    !dprReady;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            My Attendance
          </CardTitle>

          <p className="mt-1 text-xs text-muted-foreground">
            Check-in records attendance for the signed-in employee.
          </p>
        </div>

        {workDay && (
          <StatusBadge status={workDay.attendanceStatus} />
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="flex flex-col gap-4">
            {/* Attendance times */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">
                  Check-in
                </p>

                <p className="font-medium">
                  {workDay?.checkInAt
                    ? formatDateTime(workDay.checkInAt)
                    : '-'}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Check-out
                </p>

                <p className="font-medium">
                  {workDay?.checkOutAt
                    ? formatDateTime(workDay.checkOutAt)
                    : '-'}
                </p>
              </div>
            </div>

            {/* Checkout warning */}
            {workDay?.checkInAt &&
              !workDay?.checkOutAt &&
              (
                hasPendingTasks ||
                !dprReady
              ) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Before checkout: resolve{' '}
                  {eod?.pending ?? 0} pending task(s) and
                  submit today's DPR. Completed tasks need
                  screenshot proof; incomplete tasks need a
                  valid reason.
                </div>
              )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                disabled={
                  !!workDay?.checkInAt ||
                  checkIn.isPending
                }
                onClick={() => checkIn.mutate({})}
              >
                <LogIn className="h-4 w-4" />
                Check in
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                disabled={checkoutBlocked}
                onClick={() => checkOut.mutate({})}
              >
                <LogOut className="h-4 w-4" />
                Check out
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
