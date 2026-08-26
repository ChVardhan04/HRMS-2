const CACHE_NAME = 'hrms-shell-v1';
const OFFLINE_URLS = ['/dashboard', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Network-first for API calls, cache-first for the app shell. Mutating POSTs (check-in, DPR
// draft) that fail offline are queued in IndexedDB by lib/offline-queue.ts and flushed on
// 'sync' — see plan section 34.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'hrms-offline-queue') {
    event.waitUntil(self.clients.matchAll().then((clients) => clients.forEach((c) => c.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' }))));
  }
});
