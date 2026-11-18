const CACHE_NAME = 'gmt-ariana-v7';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-gmt.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Listen for SKIP_WAITING message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch handler: Network-First to guarantee latest code updates on smartphones
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // In development, tunnels, or API traffic: bypass Service Worker completely
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname.startsWith('192.168.') ||
    url.hostname.startsWith('10.') ||
    url.hostname.startsWith('172.') ||
    url.hostname.includes('trycloudflare.com') ||
    url.hostname.includes('loca.lt') ||
    url.hostname.includes('ngrok') ||
    url.port === '5173' ||
    url.port === '5174' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src') ||
    url.pathname.startsWith('/node_modules') ||
    url.pathname.includes('vite') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // Network-First strategy: always fetch fresh version first, fallback to cache if offline
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(e.request).then((cached) => {
          return cached || caches.match('/') || new Response('Hors-ligne', { status: 503 });
        });
      })
  );
});

// Web Push Notification event handler
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (err) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Notification GMT Ariana';
  const receivedAt = data.data?.receivedAt || new Date().toISOString();

  const options = {
    body: data.body || 'Nouvelle alerte disponible.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/logo-gmt.png',
    vibrate: [150, 75, 150],
    data: {
      url: data.data?.url || data.url || '/',
      receivedAt,
      ...data.data,
    },
    tag: data.tag || 'gmt-alert-' + Date.now(),
    renotify: true,
  };

  const notificationPromise = self.registration.showNotification(title, options);
  const broadcastPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'PUSH_RECEIVED',
        payload: {
          title,
          body: options.body,
          receivedAt,
          url: options.data.url,
        },
      });
    });
  });

  event.waitUntil(Promise.all([notificationPromise, broadcastPromise]));
});

// PWA Notification click handler
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(targetUrl) || targetUrl === '/') {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});