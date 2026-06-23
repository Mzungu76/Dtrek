const STATIC_CACHE = 'dtrek-static-v2';
const API_CACHE    = 'dtrek-api-v1';

// Pages / assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/statistiche',
  '/mappa',
  '/programma',
  '/upload',
  '/profilo',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const VALID = [STATIC_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !VALID.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: strategy by request type ─────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests from this origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // ── API GET routes: network-first with cache fallback ──────────────────────
  // This enables full offline reading: if the network is unavailable, the SW
  // serves the last known response from the API cache.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            // Store a fresh copy in the API cache
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Network unavailable → serve stale cached response
          const cached = await caches.match(request, { cacheName: API_CACHE });
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  // ── Next.js static assets: cache-first (they are content-hashed) ──────────
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // ── Next.js image optimization: network-first, cache on success ──────────
  if (url.pathname.startsWith('/_next/image')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── App pages: stale-while-revalidate ─────────────────────────────────────
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => new Response(
          '<!DOCTYPE html><html lang="it"><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:3rem 1rem;">' +
          '<h1>Sei offline</h1><p>Controlla la connessione e riprova.</p>' +
          '<button onclick="location.reload()" style="padding:.5rem 1.5rem;border-radius:.5rem;border:1px solid #ccc;">Riprova</button>' +
          '</body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        ));
      return cached ?? fetchPromise;
    })
  );
});
