// Increment this version string (e.g., v1 -> v2) every time you deploy major updates
const CACHE_NAME = 'eduportal-v2';

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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting()) // Force active worker activation immediately
  );
});

// Activate Event: Delete old caches instantly
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all open pages immediately
  );
});

// Fetch Event: Network-First for HTML/App Shell, Cache-First for static assets
self.addEventListener('fetch', (event) => {
  // Pass-through for OPFS blobs and Worker API proxies
  if (event.request.url.includes('workers.dev') || event.request.url.startsWith('blob:')) {
    return;
  }

  const isHtmlRequest = event.request.mode === 'navigate' || event.request.url.endsWith('index.html');

  if (isHtmlRequest) {
    // NETWORK-FIRST STRATEGY FOR INDEX.HTML
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // If online, fetch updated index.html and update cache in background
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline, serve cached index.html
          return caches.match('./index.html') || caches.match('./');
        })
    );
  } else {
    // CACHE-FIRST STRATEGY FOR OTHER ASSETS (Fonts, CSS, Icons)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
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
