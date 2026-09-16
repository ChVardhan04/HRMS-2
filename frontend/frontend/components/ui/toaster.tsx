'use client';

import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-elevated animate-in slide-in-from-bottom-4',
            t.variant === 'destructive' && 'border-destructive/40',
            t.variant === 'success' && 'border-success/40',
          )}
        >
          {t.variant === 'destructive' ? (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          ) : t.variant === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          ) : (
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{t.title}</p>
            {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
