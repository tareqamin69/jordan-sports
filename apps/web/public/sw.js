// Service worker: installability + a graceful offline screen + fast repeat loads of static
// assets. It never caches pages or API responses — availability, prices and session state must
// always come from the network, never a stale cache — so bump CACHE_VERSION on release and the
// old cache is dropped in `activate`; nothing here is a substitute for freshness checks upstream.
const CACHE_VERSION = 'jorena-shell-v2';
const SHELL_ASSETS = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never intercept bookings/holds/confirmations
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always network-first — a cached venue/availability/booking page would show stale
  // data. Offline, fall back to the static offline screen instead of failing outright.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  // Next.js fingerprints these paths by content hash, so caching them aggressively is safe and
  // makes repeat visits and flaky connections noticeably faster.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
  // Everything else (the API, images) passes straight through to the network.
});
