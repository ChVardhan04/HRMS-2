'use client';

import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/shared/empty-state';
import { useMyKraScores } from '@/features/kra/use-kra';

export function KraSummaryCard() {
  const { data: scores, isLoading } = useMyKraScores();
  const latest = scores?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" /> KRA Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        ) : !latest ? (
          <EmptyState icon={Target} title="No score calculated yet" description="Scores appear after the first monthly calculation." />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold">{Number(latest.finalScore).toFixed(1)}%</span>
              <span className="text-xs text-muted-foreground">
                {latest.periodMonth}/{latest.periodYear} {latest.isFinal ? '(final)' : '(projected)'}
              </span>
            </div>
            <Progress value={Number(latest.finalScore)} />
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {Object.entries(latest.breakdown ?? {}).map(([key, val]: any) => {
                const metric = latest.template?.items?.find((i:any) => i.id === key);
                return <div key={key} className="flex justify-between rounded-md bg-muted/50 px-2 py-1">
                  <span>{metric?.name ?? key.replace(/_/g, ' ')}</span>
                  <span className="font-medium text-foreground">{val.achievementPercent}%</span>
                </div>;
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
