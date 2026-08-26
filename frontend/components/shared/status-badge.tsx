import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'secondary'> = {
  PRESENT: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  JOINED: 'success',
  SENT: 'success',
  ACCEPTED: 'success',
  LATE: 'warning',
  HALF_DAY: 'warning',
  PENDING: 'warning',
  SUBMITTED: 'warning',
  IN_PROGRESS: 'warning',
  UNDER_REVIEW: 'warning',
  NEEDS_CHANGES: 'warning',
  MANAGER_APPROVED: 'warning',
  DRAFT: 'muted',
  ABSENT: 'destructive',
  REJECTED: 'destructive',
  CANCELLED: 'muted',
  OVERDUE: 'destructive',
  ON_LEAVE: 'secondary',
  HOLIDAY: 'secondary',
  WEEKEND: 'muted',
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANT[status] ?? 'secondary';
  return <Badge variant={variant}>{status.replace(/_/g, ' ')}</Badge>;
}
