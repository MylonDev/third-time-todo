// The app is served from a subpath on GitHub Pages, so nothing here may assume
// the site root: every URL is derived from this worker's own scope.
const CACHE_NAME = 'third-time-v2';
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  // Precache the shell so the app opens offline. A failure here must not stop
  // the worker installing, or a flaky first load would leave the app uncached.
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(SCOPE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

async function put(request, response) {
  if (!response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: the network first, so a new deploy arrives on the next open, and
  // the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          event.waitUntil(put(SCOPE, response.clone()));
          return response;
        })
        .catch(() => caches.match(SCOPE).then((cached) => cached || Response.error()))
    );
    return;
  }

  // Everything else (hashed assets, icons): cached copy now, refreshed behind it.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          event.waitUntil(put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
