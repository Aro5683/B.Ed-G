const CACHE_NAME = 'eduportal-dynamic-v1';

// Static assets to pre-cache for full offline rendering
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

// Install Event: Pre-cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force active worker activation immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event: Take control of clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete any outdated legacy caches if present
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          })
        );
      })
    ])
  );
});

// Fetch Event: Network-First with Cache-Busting for HTML, Cache-First for assets
self.addEventListener('fetch', (event) => {
  // Pass-through for OPFS blobs and Worker API proxies
  if (event.request.url.includes('workers.dev') || event.request.url.startsWith('blob:')) {
    return;
  }

  const isHtmlRequest = event.request.mode === 'navigate' || 
                        event.request.headers.get('accept')?.includes('text/html') || 
                        event.request.url.endsWith('index.html');

  if (isHtmlRequest) {
    // NETWORK-FIRST WITH CACHE-BUSTING FOR INDEX.HTML
    event.respondWith(
      // Append timestamp to prevent HTTP browser caching of the HTML file
      fetch(new Request(event.request.url, { cache: 'no-store' }))
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Update both the exact URL and base path in offline cache
              cache.put('./index.html', responseClone.clone());
              cache.put('./', responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline, fall back to cached index.html or root
          return caches.match('./index.html').then((cachedFile) => {
            return cachedFile || caches.match('./');
          });
        })
    );
  } else {
    // CACHE-FIRST STRATEGY FOR OTHER ASSETS
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
