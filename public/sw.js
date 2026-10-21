const CACHE_NAME = 'portfolio-tracker-v19';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept or cache Vite development modules, source files, or Vite internal requests
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/_aistudio') ||
    url.pathname.startsWith('/__') ||
    url.search.includes('t=') ||
    url.search.includes('v=')
  ) {
    return;
  }

  // Pass through to network
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
