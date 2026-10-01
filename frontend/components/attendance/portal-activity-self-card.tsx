'use client';

import { Laptop } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTodayWorkDay } from '@/features/workday/use-workday';

export function PortalActivitySelfCard() {
  const { data: workDay } = useTodayWorkDay();
  const minutes = Number(workDay?.portalActiveMinutes ?? 0);
  const checks = Number(workDay?.portalHeartbeatCount ?? 0);

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <Laptop className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">My HRMS tracked time today</p>
            <p className="text-xs text-muted-foreground">
              Tracking starts after check-in. Lunch time is excluded automatically.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">{(minutes / 60).toFixed(1)}h</p>
          <p className="text-xs text-muted-foreground">{checks} hourly checks</p>
        </div>
      </CardContent>
    </Card>
  );
}
