const CACHE_NAME = 'portfolio-tracker-v23';

// Service Worker lifecycle & cache logger
function logSW(action, ...args) {
  console.log(`%c[SW ${new Date().toLocaleTimeString()}]%c ${action}`, 'color: #10b981; font-weight: bold;', 'color: inherit;', ...args);
}

self.addEventListener('install', () => {
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

  // Never intercept Vite development server modules or hot reloads
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/') || url.search.includes('t=')) {
    return;
  }

  // ALL requests on same origin: NETWORK-FIRST, cache fallback
  // This completely eliminates stale/broken JS asset locks on iOS/iPhones
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async (err) => {
        logSW(`Network failed for ${url.pathname}, falling back to cache...`, err);
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
          return (await caches.match('./index.html')) || (await caches.match('/index.html'));
        }
        throw err;
      })
  );
});
