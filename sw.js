const CACHE_NAME = 'routine-app-v8';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'SCHEDULE_NOTIFICATION' || !data.timestamp) return;
  if (!self.registration.showNotification || typeof TimestampTrigger === 'undefined') {
    event.source && event.source.postMessage({ type: 'SCHEDULER_UNSUPPORTED', tag: data.tag });
    return;
  }
  const trigger = new TimestampTrigger(Number(data.timestamp));
  event.waitUntil(self.registration.showNotification(data.title || 'Routine reminder', {
    body: data.body || 'You have a task waiting.',
    tag: data.tag || 'routine-reminder',
    icon: './routine-brand.png',
    badge: './routine-brand.png',
    showTrigger: trigger,
    data: { url: './index.html', tag: data.tag || 'routine-reminder' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) if ('focus' in client) return client.focus();
    return clients.openWindow(event.notification.data?.url || './index.html');
  }));
});
