const CACHE_NAME = 'alhout-static-v1';
const STATIC_ASSETS = ['/login', '/icons/whale.svg', '/icons/whale-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/_next/data')
  ) {
    return;
  }
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});

