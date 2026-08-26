import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-12 text-center', className)}>
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
