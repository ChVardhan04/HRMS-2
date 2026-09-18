'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useTodayWorkDay } from '@/features/workday/use-workday';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Sends lightweight portal heartbeats after check-in.
 *
 * The browser is not reliable for exact one-hour timers: background tabs can be
 * throttled and sleeping laptops pause JavaScript completely. The backend
 * therefore calculates elapsed time from the last successful heartbeat and
 * catches up completed intervals when the next request arrives.
 *
 * We send every 5 minutes instead of once an hour so a normal open tab gets
 * regular requests, while the backend still counts only completed hours in the
 * hourly-check counter. Visibility changes and the browser coming back online
 * trigger an immediate retry.
 */
export function PortalActivityTracker() {
  const user = useAuthStore((s) => s.user);
  const { data: workDay } = useTodayWorkDay();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.employee?.id || !workDay?.checkInAt || workDay?.checkOutAt) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const heartbeat = async () => {
      if (cancelled) return;
      try {
        await api.post('/attendance/portal-heartbeat', {
          // Kept for API compatibility. The server uses its own WorkDay cursor
          // so multiple tabs/reloads cannot reset the timer.
          sessionId: 'browser',
          clientTime: new Date().toISOString(),
        });
        if (!cancelled) {
          qc.invalidateQueries({ queryKey: ['work-day', 'today'] });
          qc.invalidateQueries({ queryKey: ['work-day', 'team-today'] });
        }
      } catch {
        // A temporary network/browser sleep is fine. The next heartbeat will
        // retry and the server will catch up elapsed time from its last cursor.
      }
    };

    // Start immediately after check-in, then retry every five minutes.
    void heartbeat();
    timer = setInterval(() => void heartbeat(), 5 * 60 * 1000);

    const onVisibility = () => {
      // Do not block hidden tabs. Browsers may throttle them, but when the page
      // becomes visible again this gives us an immediate catch-up request.
      if (document.visibilityState === 'visible') void heartbeat();
    };
    const onOnline = () => void heartbeat();
    const onFocus = () => void heartbeat();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.employee?.id, workDay?.checkInAt, workDay?.checkOutAt, qc]);

  return null;
}
