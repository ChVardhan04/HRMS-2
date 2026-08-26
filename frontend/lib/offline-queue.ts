'use client';

// Minimal offline queue for the two actions the plan calls out explicitly (section 34):
// check-in and DPR draft saves. Persists to localStorage (simple, dependency-free) and flushes
// when connectivity returns.
export interface QueuedAction {
  id: string;
  type: 'CHECK_IN' | 'DPR_DRAFT';
  payload: unknown;
  createdAt: string;
}

const KEY = 'hrms_offline_queue';

export function enqueueOfflineAction(action: Omit<QueuedAction, 'id' | 'createdAt'>) {
  const queue = getQueue();
  queue.push({ ...action, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function getQueue(): QueuedAction[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function clearQueueItem(id: string) {
  const queue = getQueue().filter((q) => q.id !== id);
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export async function flushOfflineQueue(handler: (action: QueuedAction) => Promise<void>) {
  const queue = getQueue();
  for (const action of queue) {
    try {
      await handler(action);
      clearQueueItem(action.id);
    } catch {
      // leave in queue, retry next time connectivity returns
    }
  }
}
