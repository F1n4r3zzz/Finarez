/* ============================================================
   FinanzLog — Service Worker
   ============================================================ */

const CACHE_NAME = 'finanzlog-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/finanzlog.css',
  '/finanzlog.js',
  '/manifest.webmanifest'
];

// Instalar: pre-cachear todos los assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar caches antiguas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first para assets propios, network para el resto
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Solo interceptar requests del mismo origen
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(response => {
        // Cachear respuestas exitosas de assets locales
        if (response.ok && ASSETS.some(a => url.pathname.endsWith(a.replace('/', '')))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback a index.html si estamos offline y se pide una página
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
