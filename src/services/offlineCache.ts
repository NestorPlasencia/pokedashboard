/**
 * Persistent caching for the data the dashboard needs to render.
 *
 * The rule is "network when it answers, saved copy when it does not". A saved copy is
 * served past its TTL rather than failing, so an internet outage degrades to browsing
 * slightly older data instead of an empty screen. Callers learn a copy was stale through
 * the returned `stale` flag, and the UI surfaces it so nobody mistakes old prices for new.
 *
 * Images are not handled here - they arrive through <img> tags, which only a service
 * worker can intercept. See public/sw.js; this module owns the names and the clearing.
 */

/** JSON this module fetches and stores itself. */
export const DATA_CACHE = 'pokedashboard-data-v1';
/** Card and set images, written by the service worker. */
export const IMAGE_CACHE = 'pokedashboard-images-v1';
/** The built app shell, written by the service worker. */
export const APP_CACHE = 'pokedashboard-app-v1';
/** Price bundles, owned by runtimeCards.ts and cleared from here. */
export const PRICE_CACHE = 'pokedashboard-tcg-prices-v5';

/** Header carrying an entry's byte size, so reporting never re-reads whole bodies. */
const SIZE_HEADER = 'x-pokedashboard-size';
/** Header carrying when an entry was written, so freshness survives a reload. */
const STORED_AT_HEADER = 'x-pokedashboard-stored-at';

export type CachedLoad<T> = {
  value: T;
  /** When the served copy was written, or null when it came straight from the network. */
  storedAt: number | null;
  /** True when the network failed and this is a saved copy past its TTL. */
  stale: boolean;
};

const cacheUrl = (key: string) =>
  new URL(`/__pokedashboard_cache__/${encodeURIComponent(key)}`, window.location.origin).toString();

/** Cache API is missing in insecure contexts and private modes; callers degrade to network-only. */
const openDataCache = async (): Promise<Cache | null> => {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    return await window.caches.open(DATA_CACHE);
  } catch (error) {
    console.warn('[cache] Cache storage is unavailable', error);
    return null;
  }
};

type StoredEntry<T> = { value: T; storedAt: number } | null;

const readEntry = async <T>(cache: Cache, key: string): Promise<StoredEntry<T>> => {
  try {
    const response = await cache.match(cacheUrl(key));
    if (!response) return null;
    const storedAt = Number(response.headers.get(STORED_AT_HEADER));
    return { value: (await response.json()) as T, storedAt: Number.isFinite(storedAt) ? storedAt : 0 };
  } catch (error) {
    // A truncated or half-written entry must not take the app down with it.
    console.warn('[cache] Discarding an unreadable entry', { key, error });
    return null;
  }
};

const writeEntry = async (cache: Cache, key: string, value: unknown): Promise<void> => {
  try {
    const body = JSON.stringify(value);
    await cache.put(
      cacheUrl(key),
      new Response(body, {
        headers: {
          'Content-Type': 'application/json',
          [SIZE_HEADER]: String(new Blob([body]).size),
          [STORED_AT_HEADER]: String(Date.now()),
        },
      })
    );
  } catch (error) {
    // Out of quota, or storage blocked. Losing the copy is not worth failing the load.
    console.warn('[cache] Unable to store an entry', { key, error });
  }
};

// ---------------------------------------------------------------------------
// Stale tracking: what the UI needs to say "you are looking at saved data".
// ---------------------------------------------------------------------------

const staleEntries = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: { staleKeys: string[]; oldestStoredAt: number | null } = { staleKeys: [], oldestStoredAt: null };

const publish = () => {
  const entries = [...staleEntries.entries()];
  // A new object identity each time is what tells useSyncExternalStore to re-render.
  snapshot = {
    staleKeys: entries.map(([key]) => key),
    oldestStoredAt: entries.length ? Math.min(...entries.map(([, storedAt]) => storedAt)) : null,
  };
  listeners.forEach(listener => listener());
};

const markStale = (key: string, storedAt: number) => {
  if (staleEntries.get(key) === storedAt) return;
  staleEntries.set(key, storedAt);
  publish();
};

const markFresh = (key: string) => {
  if (staleEntries.delete(key)) publish();
};

/** Which cached values are currently being served past their TTL, and how old they are. */
export const getOfflineSnapshot = () => snapshot;

export const subscribeToOfflineState = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

// ---------------------------------------------------------------------------
// The cache-aware loader
// ---------------------------------------------------------------------------

/**
 * Returns `key`'s value, preferring a cached copy that is still within `ttlMs` and
 * otherwise going to the network. If the network fails and a copy exists - however old -
 * that copy is returned with `stale: true` instead of an error. Only a failure with
 * nothing cached rejects.
 */
export const loadCached = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number
): Promise<CachedLoad<T>> => {
  const cache = await openDataCache();
  const entry = cache ? await readEntry<T>(cache, key) : null;

  if (entry && entry.storedAt + ttlMs > Date.now()) {
    markFresh(key);
    return { value: entry.value, storedAt: entry.storedAt, stale: false };
  }

  try {
    const value = await fetcher();
    if (cache) await writeEntry(cache, key, value);
    markFresh(key);
    return { value, storedAt: Date.now(), stale: false };
  } catch (error) {
    if (entry) {
      console.warn('[cache] Network failed; serving the saved copy', {
        key,
        storedAt: new Date(entry.storedAt).toISOString(),
        error,
      });
      markStale(key, entry.storedAt);
      return { value: entry.value, storedAt: entry.storedAt, stale: true };
    }
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Reporting and clearing
// ---------------------------------------------------------------------------

export type CacheReport = {
  name: string;
  /** Shown in the UI. */
  label: string;
  description: string;
  entries: number;
  /** Bytes, when they can be known without re-reading every body. Null for images, whose
   *  responses are opaque and report a size of zero. */
  bytes: number | null;
};

export type CacheOverview = {
  reports: CacheReport[];
  /** Everything this origin uses, from the browser's own accounting. */
  usage: number | null;
  quota: number | null;
  serviceWorker: 'active' | 'starting' | 'unsupported' | 'unregistered';
};

const CACHE_DESCRIPTIONS: { name: string; label: string; description: string }[] = [
  { name: DATA_CACHE, label: 'Card data', description: 'Series, sets and Pokémon forms' },
  { name: PRICE_CACHE, label: 'Prices', description: 'TCGplayer price bundles' },
  { name: IMAGE_CACHE, label: 'Images', description: 'Card and set artwork' },
  { name: APP_CACHE, label: 'App shell', description: 'The dashboard itself, for offline start-up' },
];

const reportFor = async (name: string, label: string, description: string): Promise<CacheReport> => {
  const empty = { name, label, description, entries: 0, bytes: 0 };
  if (!('caches' in window)) return { ...empty, bytes: null };
  try {
    if (!(await window.caches.has(name))) return empty;
    const cache = await window.caches.open(name);
    const keys = await cache.keys();
    let bytes: number | null = 0;
    for (const request of keys) {
      const response = await cache.match(request);
      const declared = Number(response?.headers.get(SIZE_HEADER) ?? response?.headers.get('content-length'));
      // Opaque responses report nothing, so the total for that cache is unknowable.
      if (!Number.isFinite(declared) || declared <= 0) { bytes = null; break; }
      bytes += declared;
    }
    return { name, label, description, entries: keys.length, bytes };
  } catch (error) {
    console.warn('[cache] Unable to inspect a cache', { name, error });
    return { ...empty, bytes: null };
  }
};

/**
 * A registration exists well before it controls the page, so "registered" and "working"
 * are separate answers - reporting the first as the second would have the panel claim
 * images are being saved while the worker is still installing.
 */
const readServiceWorkerState = async (): Promise<CacheOverview['serviceWorker']> => {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'unregistered';
    return registration.active ? 'active' : 'starting';
  } catch {
    return 'unregistered';
  }
};

export const readCacheOverview = async (): Promise<CacheOverview> => {
  const reports = await Promise.all(
    CACHE_DESCRIPTIONS.map(({ name, label, description }) => reportFor(name, label, description))
  );
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    usage = estimate?.usage ?? null;
    quota = estimate?.quota ?? null;
  } catch {
    // Storage estimates are optional; the per-cache counts still stand on their own.
  }
  return { reports, usage, quota, serviceWorker: await readServiceWorkerState() };
};

/**
 * Deletes the named caches. In-memory state in the loaders is not touched, so callers that
 * want the next read to actually hit the network should reload the page afterwards.
 */
export const clearCaches = async (names: string[]): Promise<void> => {
  if (!('caches' in window)) return;
  await Promise.all(names.map(name => window.caches.delete(name).catch(error => {
    console.warn('[cache] Unable to clear a cache', { name, error });
    return false;
  })));
  for (const name of names) {
    if (name === DATA_CACHE) {
      staleEntries.clear();
      publish();
    }
  }
};

/** Every cache this app owns, for the "clear everything" action. */
export const ALL_CACHE_NAMES = CACHE_DESCRIPTIONS.map(entry => entry.name);
