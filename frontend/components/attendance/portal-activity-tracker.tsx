'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useTodayWorkDay } from '@/features/workday/use-workday';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Keeps the employee's portal-active hour counter in sync after check-in.
 * The browser sends one heartbeat for every completed active hour. If the
 * browser timer is delayed while the tab remains open, the backend catches up
 * the completed hours in one idempotent request. A closed tab cannot send a
 * heartbeat, so it does not invent extra time on a later visit.
 */
export function PortalActivityTracker() {
  const user = useAuthStore((s) => s.user);
  const { data: workDay } = useTodayWorkDay();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.employee?.id || !workDay?.checkInAt || workDay?.checkOutAt) return;

    let sessionId = sessionStorage.getItem('hrms-portal-session-id');
    if (!sessionId) {
      sessionId = `${crypto.randomUUID()}`;
      sessionStorage.setItem('hrms-portal-session-id', sessionId);
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const sendHeartbeat = async () => {
      if (cancelled || document.visibilityState === 'hidden') return false;
      try {
        await api.post('/attendance/portal-heartbeat', { sessionId, clientTime: new Date().toISOString() });
        qc.invalidateQueries({ queryKey: ['work-day', 'today'] });
        qc.invalidateQueries({ queryKey: ['work-day', 'team-today'] });
        return true;
      } catch {
        // The next scheduled heartbeat will retry. No employee action is needed.
        return false;
      }
    };

    const schedule = () => {
      if (cancelled) return;
      const base = new Date(workDay.portalLastHeartbeatAt ?? workDay.checkInAt).getTime();
      const elapsed = Math.max(0, Date.now() - base);
      const remaining = Math.max(1000, 60 * 60 * 1000 - elapsed);
      timer = setTimeout(async () => {
        if (document.visibilityState === 'hidden') {
          timer = setTimeout(schedule, 60 * 1000);
          return;
        }
        await sendHeartbeat();
        schedule();
      }, remaining);
    };

    if (workDay.portalSessionId !== sessionId) {
      void sendHeartbeat().then(() => {
        if (!cancelled) {
          timer = setTimeout(() => { void sendHeartbeat(); schedule(); }, 60 * 60 * 1000);
        }
      });
    } else {
      schedule();
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') sendHeartbeat();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.employee?.id, workDay?.checkInAt, workDay?.checkOutAt, workDay?.portalLastHeartbeatAt, qc]);

  return null;
}
