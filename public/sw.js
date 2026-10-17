const CACHE_NAME = 'portfolio-tracker-v12';

// Service Worker lifecycle & cache logger
function logSW(action, ...args) {
  console.log(`%c[SW ${new Date().toLocaleTimeString()}]%c ${action}`, 'color: #10b981; font-weight: bold;', 'color: inherit;', ...args);
}

self.addEventListener('install', (event) => {
  logSW('Install event triggered. Calling skipWaiting().');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  logSW(`Activate event triggered. Active cache version: ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then((keys) => {
      const oldKeys = keys.filter((k) => k !== CACHE_NAME);
      if (oldKeys.length > 0) {
        logSW(`Cleaning up obsolete caches: ${oldKeys.join(', ')}`);
      }
      return Promise.all(
        oldKeys.map((k) => {
          logSW(`Deleting old cache: ${k}`);
          return caches.delete(k);
        })
      );
    }).then(() => {
      logSW('All obsolete caches cleared. Claiming clients.');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML / Navigation requests: ALWAYS NETWORK FIRST, fallback to cache
  // This guarantees iPhone PWAs receive the latest HTML referencing new JS bundle hashes
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    logSW(`Navigation request (network-first): ${url.pathname}`);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            logSW(`Fetched fresh navigation from network: ${url.pathname} (storing in cache)`);
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async (err) => {
          logSW(`Network failed for navigation: ${url.pathname}. Attempting cache fallback...`, err);
          const cached = await caches.match(request);
          if (cached) {
            logSW(`Serving cached navigation: ${url.pathname}`);
            return cached;
          }
          logSW('Serving fallback /index.html from cache');
          return (await caches.match('./index.html')) || (await caches.match('/index.html'));
        })
    );
    return;
  }

  // Static assets (JS, CSS, images, icons): Cache first, fallback to network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        logSW(`Cache hit: ${url.pathname}`);
      } else {
        logSW(`Cache miss: ${url.pathname} (fetching from network)`);
      }
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch((err) => {
          logSW(`Fetch error for asset: ${url.pathname}`, err);
          return cached;
        });
      return cached || fetchPromise;
    })
  );
});
