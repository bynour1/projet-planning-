// frontend/public/sw-push.js
// Service Worker Push Event Handler — GMT Ariana
// Réception des notifications Web Push VAPID et gestion des clics

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
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

  // 1. Affiche la notification système / OS
  const notificationPromise = self.registration.showNotification(title, options);

  // 2. Transmet un message aux clients actifs pour mettre à jour la date du dernier push
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

// Clic sur une notification push
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(targetUrl) || targetUrl === '/') {
            return client.focus();
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
