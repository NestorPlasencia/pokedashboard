import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A minimal stand-in for the Cache API. Only what offlineCache.ts actually calls, so the
// module under test is the real one and only the browser around it is fake.
class FakeCache {
  store = new Map();
  async match(url) {
    const hit = this.store.get(String(url));
    if (!hit) return undefined;
    return {
      json: async () => JSON.parse(hit.body),
      headers: { get: (name) => hit.headers.get(name.toLowerCase()) ?? null },
    };
  }
  async put(url, response) { this.store.set(String(url), { body: response.__body, headers: response.__headers }); }
  async keys() { return [...this.store.keys()]; }
  async delete(key) { return this.store.delete(key); }
}

const caches = new Map();
globalThis.Blob = class { constructor(parts) { this.size = parts.join('').length; } };
globalThis.Response = class {
  constructor(body, init) {
    this.__body = body;
    this.__headers = new Map(Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  }
};
globalThis.window = {
  location: { origin: 'http://localhost' },
  caches: {
    open: async (name) => { if (!caches.has(name)) caches.set(name, new FakeCache()); return caches.get(name); },
    has: async (name) => caches.has(name),
    delete: async (name) => caches.delete(name),
  },
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    storage: { estimate: async () => ({ usage: 1234, quota: 99999 }) },
    serviceWorker: { getRegistration: async () => ({ active: {} }) },
  },
});

const { loadCached, readCacheOverview, clearCaches, getOfflineSnapshot, DATA_CACHE } =
  await import('../src/services/offlineCache.ts');

const entryUrl = (key) => `http://localhost/__pokedashboard_cache__/${key}`;
let calls = 0;
const online = async () => { calls++; return { items: ['fresh', calls] }; };
const offline = async () => { calls++; throw new Error('Failed to fetch'); };

beforeEach(async () => {
  caches.clear();
  calls = 0;
  await clearCaches([DATA_CACHE]);
});

test('a value is fetched once and then served from storage', async () => {
  const first = await loadCached('series-1', online, 60_000);
  assert.deepEqual(first.value, { items: ['fresh', 1] });
  assert.equal(first.stale, false);

  const second = await loadCached('series-1', online, 60_000);
  assert.deepEqual(second.value, { items: ['fresh', 1] }, 'the stored copy is reused');
  assert.equal(calls, 1, 'the network was not touched again');
});

test('an expired value is still served when the network fails', async () => {
  await loadCached('series-1', online, 60_000);

  const stale = await loadCached('series-1', offline, -1);
  assert.deepEqual(stale.value, { items: ['fresh', 1] });
  assert.equal(stale.stale, true, 'callers are told the copy is old');
  assert.deepEqual(getOfflineSnapshot().staleKeys, ['series-1'], 'the UI can report it');
  assert.equal(getOfflineSnapshot().oldestStoredAt, stale.storedAt);
});

test('the stale flag clears once the network comes back', async () => {
  const first = await loadCached('series-1', online, 60_000);
  await loadCached('series-1', offline, -1);

  const recovered = await loadCached('series-1', online, -1);
  assert.equal(recovered.stale, false);
  assert.notDeepEqual(recovered.value, first.value, 'the fresh value replaces the stored one');
  assert.deepEqual(getOfflineSnapshot().staleKeys, []);
});

test('a failure with nothing stored is a real error, not an empty result', async () => {
  await assert.rejects(() => loadCached('never-seen', offline, 60_000), /Failed to fetch/);
});

test('an unreadable entry is discarded instead of breaking the load', async () => {
  await loadCached('series-1', online, 60_000);
  (await window.caches.open(DATA_CACHE)).store.set(entryUrl('series-1'), { body: '{ not json', headers: new Map() });

  const repaired = await loadCached('series-1', online, 60_000);
  assert.equal(repaired.stale, false);
  assert.deepEqual(repaired.value, { items: ['fresh', 2] });
});

test('the overview counts entries and sizes what it can', async () => {
  await loadCached('series-1', online, 60_000);
  const overview = await readCacheOverview();
  const data = overview.reports.find((report) => report.name === DATA_CACHE);

  assert.equal(data.entries, 1);
  assert.ok(data.bytes > 0, 'sizes recorded at write time are summed back');
  assert.equal(overview.usage, 1234);
  assert.equal(overview.serviceWorker, 'active');
});

test('clearing empties the cache and resets the stale banner', async () => {
  await loadCached('series-1', online, 60_000);
  await loadCached('series-1', offline, -1);

  await clearCaches([DATA_CACHE]);
  const overview = await readCacheOverview();
  assert.equal(overview.reports.find((report) => report.name === DATA_CACHE).entries, 0);
  assert.deepEqual(getOfflineSnapshot().staleKeys, []);
});
