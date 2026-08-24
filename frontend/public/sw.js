const CACHE_NAME = 'gmt-ariana-v1';
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/logo-gmt.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS_TO_CACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api') || u.pathname.startsWith('/socket.io')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});