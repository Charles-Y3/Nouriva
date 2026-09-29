// Minimal service worker — exists for installability, not full offline
// browsing. Only manifest.json is precached.
//
// The navigate-vs-other split below is load-bearing, not stylistic:
// caching index.html cache-first would mean that after a redeploy,
// returning visitors get served a stale index.html pointing at JS/CSS
// bundle hashes that no longer exist on the server -> blank white screen
// with no recovery short of manually clearing site data. Navigation
// requests are therefore network-first, falling back to cache only when
// offline. Everything else (JS/CSS/assets) is cache-first.
const CACHE_NAME = 'nouriva-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/manifest.json']))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((res) => res || caches.match('/')))
    );
    return;
  }
  event.respondWith(caches.match(req).then((res) => res || fetch(req)));
});
