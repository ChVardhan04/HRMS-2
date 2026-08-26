'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { useNotifications } from '@/features/notifications/use-notifications';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useNotifications();
  const read = useMutation({ mutationFn: (id: string) => api.patch(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return <AppShell title="Notifications">
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div><CardTitle>Notification center</CardTitle><p className="mt-1 text-sm text-muted-foreground">Approvals, reminders and HR actions that need your attention.</p></div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="h-64 animate-pulse rounded-xl bg-muted" /> : !data?.length ? <EmptyState icon={Bell} title="You're all caught up" description="New HRMS activity will appear here." /> : <div className="divide-y">
            {data.map((n: any) => <div key={n.id} className={`flex gap-3 py-4 ${n.readAt ? 'opacity-60' : ''}`}>
              <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bell className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{n.title}</p>{!n.readAt && <Badge variant="secondary">New</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{n.body}</p><p className="mt-2 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p></div>
              {!n.readAt && <Button variant="ghost" size="sm" onClick={() => read.mutate(n.id)}><CheckCheck className="mr-1 h-4 w-4" /> Read</Button>}
            </div>)}
          </div>}
        </CardContent>
      </Card>
    </div>
  </AppShell>;
}
