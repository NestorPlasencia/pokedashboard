/* eslint-env serviceworker */
/**
 * Offline support for the parts of the page that never pass through fetch() in app code.
 *
 * Two jobs:
 *   - Images. Card art is loaded by <img src>, which nothing in the app can intercept, so
 *     it is cached here: cache-first, since a card image never changes once published.
 *   - The app shell. The built HTML/JS/CSS is cached so the dashboard still starts with no
 *     connection, using stale-while-revalidate so an update lands on the next visit.
 *
 * Everything else - the JSON APIs - is deliberately left alone. src/services/offlineCache.ts
 * caches those with TTLs and stale-fallback semantics that a blanket rule here would break.
 *
 * Cache names are duplicated in src/services/offlineCache.ts, which reports on and clears
 * them; keep the two in step.
 */

const IMAGE_CACHE = 'pokedashboard-images-v1';
const APP_CACHE = 'pokedashboard-app-v1';
const OWNED_CACHES = [IMAGE_CACHE, APP_CACHE];

/**
 * Whether to cache the app shell, set by the page through the registration URL. Off in
 * development, where the dev server rewrites modules constantly and a cached copy would
 * break hot reloading. Images are cached either way: they are remote and immutable.
 */
const CACHE_APP_SHELL = new URL(self.location.href).searchParams.get('shell') === '1';

/** Keeps the image cache from growing without bound. Roughly a few hundred MB of card art. */
const IMAGE_ENTRY_LIMIT = 3000;
/** Trimming every write would be wasteful, so it runs once every this many stores. */
const TRIM_INTERVAL = 50;
let storesSinceTrim = 0;

self.addEventListener('install', () => {
  // The new worker should take over rather than wait for every tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Drop caches from older versions of this worker, leaving the app's own data caches
    // (which this worker never writes) untouched.
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith('pokedashboard-') && !OWNED_CACHES.includes(name) && !name.startsWith('pokedashboard-data') && !name.startsWith('pokedashboard-tcg-prices'))
        .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

/** Oldest entries first: cache.keys() yields insertion order, so the head is the oldest. */
const trimImageCache = async () => {
  const cache = await caches.open(IMAGE_CACHE);
  const keys = await cache.keys();
  const excess = keys.length - IMAGE_ENTRY_LIMIT;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map(key => cache.delete(key)));
};

/**
 * Cache-first. A card image is immutable, so a hit is always good and skipping the network
 * is the whole point. Cross-origin art is fetched without CORS, which yields an opaque
 * response: it displays correctly but its size cannot be measured, which is why the cache
 * panel reports images by count rather than bytes.
 */
const handleImage = async request => {
  const cache = await caches.open(IMAGE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    // An error status is a real answer and must not be cached as if it were the artwork.
    if (response.ok || response.type === 'opaque') {
      await cache.put(request, response.clone());
      if (++storesSinceTrim >= TRIM_INTERVAL) {
        storesSinceTrim = 0;
        await trimImageCache();
      }
    }
    return response;
  } catch (error) {
    // Offline with nothing saved: a transparent pixel keeps the layout intact and lets the
    // card's own text carry the meaning, rather than showing a broken-image icon.
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' }, status: 200 }
    );
  }
};

/** Stale-while-revalidate: instant from cache, refreshed in the background for next time. */
const handleAppShell = async request => {
  const cache = await caches.open(APP_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (hit) return hit;
  const response = await network;
  if (response) return response;
  // Offline, never visited: a navigation can still fall back to a cached entry point.
  if (request.mode === 'navigate') {
    const fallback = await cache.match('/index.html') || await cache.match('/');
    if (fallback) return fallback;
  }
  return Response.error();
};

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // The JSON APIs belong to offlineCache.ts, which knows their freshness rules.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  // Never cache the private cache-entry URLs offlineCache.ts writes for itself.
  if (url.pathname.startsWith('/__pokedashboard_cache__/')) return;

  if (request.destination === 'image') {
    event.respondWith(handleImage(request));
    return;
  }

  const isAppShell =
    CACHE_APP_SHELL &&
    url.origin === self.location.origin &&
    (request.mode === 'navigate' || ['script', 'style', 'font', 'manifest'].includes(request.destination));
  if (isAppShell) {
    event.respondWith(handleAppShell(request));
  }
});
