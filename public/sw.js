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
  // Offline navigation tile packages ('dtrek-tiles-<hikeId>-v1' and the
  // shared fallback bucket) are versioned and managed explicitly by
  // lib/offline/packageManager.ts (deleteOfflinePackage, or a version bump
  // here forcing a clean re-download) — never swept by this generic cleanup.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !VALID.includes(k) && !k.startsWith('dtrek-tiles-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fire-and-forget cache write — never let a caching failure (a request mode
// the Cache API rejects, quota exceeded, etc.) surface as an unhandled
// rejection or interfere with the actual response already being served.
function safePut(cacheName, request, response) {
  caches.open(cacheName).then((cache) => cache.put(request, response)).catch(() => {});
}

// ── Fetch: strategy by request type ─────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests from this origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Next.js App Router client-side navigations fetch the RSC payload from
  // the SAME URL as the full page (identified by the RSC/Next-Router-*
  // headers or the `_rsc` query param some versions append). Caching that
  // payload under the same cache key as the full HTML document — or vice
  // versa — serves a broken mismatched response on the next load. Simplest
  // safe fix: let the browser handle these directly, uncached.
  if (request.headers.get('RSC') || request.headers.has('Next-Router-State-Tree') || url.searchParams.has('_rsc')) {
    return;
  }

  // Whatever branch below runs, guarantee event.respondWith() always settles
  // to an actual Response — an uncaught throw or a rejected promise here is
  // what produces the browser's opaque "network error response" instead of
  // the page (or its own offline fallback) loading.
  const respondSafely = (promise, fallbackFactory) => {
    event.respondWith(
      Promise.resolve()
        .then(() => promise)
        .catch(() => fallbackFactory())
    );
  };

  // ── Map tiles: cache-first against any downloaded offline package ─────────
  // Offline navigation packages are written directly into per-hike
  // 'dtrek-tiles-<hikeId>-v1' caches by lib/offline/packageManager.ts, not by
  // this fetch handler. caches.match() with no cacheName searches every
  // cache bucket, so a tile downloaded for hike A is served here even while
  // browsing hike B. Tiles not part of any package fall through to a shared
  // best-effort cache, same network-first pattern as the API routes below.
  if (url.pathname.startsWith('/api/tile')) {
    respondSafely(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response.ok) safePut('dtrek-tiles-shared-v1', request, response.clone());
            return response;
          });
      }),
      () => new Response(null, { status: 503 }),
    );
    return;
  }

  // ── API GET routes: network-first with cache fallback ──────────────────────
  // This enables full offline reading: if the network is unavailable, the SW
  // serves the last known response from the API cache.
  if (url.pathname.startsWith('/api/')) {
    respondSafely(
      fetch(request).then((response) => {
        if (response.ok) safePut(API_CACHE, request, response.clone());
        return response;
      }),
      async () => {
        const cached = await caches.match(request, { cacheName: API_CACHE }).catch(() => null);
        return cached ?? new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    );
    return;
  }

  // ── Next.js static assets: cache-first (they are content-hashed) ──────────
  if (url.pathname.startsWith('/_next/static/')) {
    respondSafely(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          safePut(STATIC_CACHE, request, response.clone());
          return response;
        });
      }),
      () => new Response(null, { status: 503 }),
    );
    return;
  }

  // ── Next.js image optimization: network-first, cache on success ──────────
  if (url.pathname.startsWith('/_next/image')) {
    respondSafely(
      fetch(request).then((response) => {
        safePut(STATIC_CACHE, request, response.clone());
        return response;
      }),
      async () => (await caches.match(request).catch(() => null)) ?? new Response(null, { status: 503 }),
    );
    return;
  }

  // ── App pages: stale-while-revalidate ─────────────────────────────────────
  const offlinePage = () => new Response(
    '<!DOCTYPE html><html lang="it"><meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding:3rem 1rem;">' +
    '<h1>Sei offline</h1><p>Controlla la connessione e riprova.</p>' +
    '<button onclick="location.reload()" style="padding:.5rem 1.5rem;border-radius:.5rem;border:1px solid #ccc;">Riprova</button>' +
    '</body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
  respondSafely(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) safePut(STATIC_CACHE, request, response.clone());
          return response;
        })
        .catch(() => offlinePage());
      return cached ?? fetchPromise;
    }),
    offlinePage,
  );
});
