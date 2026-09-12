import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// public/sw.js only ever runs inside a service worker, so it is loaded here into a fake
// worker scope. That makes its routing decisions - especially the ones about what it must
// NOT touch - checkable without a browser.

class FakeCache {
  store = new Map();
  async match(request) { return this.store.get(request.url ?? request); }
  async put(request, response) { this.store.set(request.url ?? request, response); }
  async keys() { return [...this.store.keys()].map((url) => ({ url })); }
  async delete(request) { return this.store.delete(request.url ?? request); }
}

let cacheMap;
let listeners;
let devListeners;
let fetchMode;
let fetchCount;

const imageCache = () => cacheMap.get('pokedashboard-images-v1') ?? new FakeCache();

/** Loads public/sw.js into a fake worker scope registered with the given `shell` flag. */
const loadWorker = (shell, caches, into) => {
  const context = {
    self: {
      location: { origin: 'https://app.example', href: `https://app.example/sw.js?shell=${shell}` },
      addEventListener: (type, handler) => { into[type] = handler; },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches,
    fetch: async (request) => {
      fetchCount++;
      if (fetchMode === 'fail') throw new Error('offline');
      return { ok: fetchMode === 'ok', type: 'basic', url: request.url, __from: 'network', clone() { return this; } };
    },
    URL,
    Response: class {
      constructor(body, init) { this.body = body; this.init = init; this.__from = 'placeholder'; }
      static error() { return { __from: 'error' }; }
    },
    console: { warn: () => {}, info: () => {}, debug: () => {} },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8'), context);
};

before(() => {
  cacheMap = new Map();
  listeners = {};
  devListeners = {};
  const caches = {
    open: async (name) => { if (!cacheMap.has(name)) cacheMap.set(name, new FakeCache()); return cacheMap.get(name); },
    keys: async () => [...cacheMap.keys()],
    delete: async (name) => cacheMap.delete(name),
  };
  loadWorker('1', caches, listeners);
  loadWorker('0', caches, devListeners);
});

beforeEach(() => { fetchMode = 'ok'; fetchCount = 0; });

const request = (url, extra = {}) => ({ url, method: 'GET', destination: '', mode: 'no-cors', ...extra });

/** Returns the promise the worker responded with, or undefined when it stayed out of the way. */
const dispatch = (req) => {
  let responded;
  listeners.fetch({ request: req, respondWith: (promise) => { responded = promise; } });
  return responded;
};

test('the worker stays out of the way of everything it does not own', () => {
  assert.equal(dispatch(request('https://app.example/api/prices?seriesId=1')), undefined,
    'the JSON APIs have their own TTL rules in offlineCache.ts');
  assert.equal(dispatch(request('https://app.example/__pokedashboard_cache__/series-1')), undefined,
    'the data cache writes its own entries');
  assert.equal(dispatch(request('https://app.example/', { method: 'POST', mode: 'navigate' })), undefined,
    'only GET is cacheable');
  assert.equal(dispatch(request('https://other.example/thing.json')), undefined,
    'third-party requests that are not images are none of its business');
});

test('an image is fetched once and then served from the cache', async () => {
  const image = request('https://images.example/card-1.png', { destination: 'image' });

  const miss = await dispatch(image);
  assert.equal(miss.__from, 'network');
  assert.equal(imageCache().store.size, 1, 'the image was stored');

  fetchCount = 0;
  await dispatch(image);
  assert.equal(fetchCount, 0, 'a hit never reaches the network');
});

test('an image that cannot be fetched degrades to a placeholder', async () => {
  fetchMode = 'fail';
  const response = await dispatch(request('https://images.example/card-2.png', { destination: 'image' }));
  assert.equal(response.__from, 'placeholder', 'a broken-image icon would be worse than blank');
  assert.equal(imageCache().store.has('https://images.example/card-2.png'), false);
});

test('an error response is never cached as if it were the artwork', async () => {
  fetchMode = 'error';
  await dispatch(request('https://images.example/card-3.png', { destination: 'image' }));
  assert.equal(imageCache().store.has('https://images.example/card-3.png'), false);
});

test('the app shell keeps working after the network goes away', async () => {
  const script = request('https://app.example/assets/index.js', { destination: 'script' });
  assert.equal((await dispatch(script)).__from, 'network');

  fetchMode = 'fail';
  assert.equal((await dispatch(script)).__from, 'network', 'served from the cached copy');
});

test('a saved link opens with no connection, whatever its query string', async () => {
  // The address bar carries the whole filter state, so a link saved to the home screen is
  // never the address that was cached. Every navigation shares the shell entry for exactly
  // this reason: without it, opening one offline failed instead of starting the app.
  assert.equal((await dispatch(request('https://app.example/', { mode: 'navigate' }))).__from, 'network');

  fetchMode = 'fail';
  const savedLink = request('https://app.example/collections?series=Base&collections=Hits', { mode: 'navigate' });
  assert.equal((await dispatch(savedLink)).__from, 'network', 'served from the stored shell');
});

test('activating drops old versions but never the app data caches', async () => {
  cacheMap.set('pokedashboard-images-v0', new FakeCache());
  cacheMap.set('pokedashboard-data-v1', new FakeCache());
  cacheMap.set('pokedashboard-tcg-prices-v5', new FakeCache());

  let finished;
  listeners.activate({ waitUntil: (promise) => { finished = promise; } });
  await finished;

  assert.equal(cacheMap.has('pokedashboard-images-v0'), false, 'superseded image cache removed');
  assert.equal(cacheMap.has('pokedashboard-images-v1'), true);
  assert.equal(cacheMap.has('pokedashboard-data-v1'), true, 'the worker must not touch the data cache');
  assert.equal(cacheMap.has('pokedashboard-tcg-prices-v5'), true);
});

test('the development worker caches images but leaves the app shell to the dev server', async () => {
  // Caching modules the dev server rewrites on every edit would break hot reloading, which
  // is why the page registers the worker with shell=0 outside production.
  const dispatchDev = (req) => {
    let responded;
    devListeners.fetch({ request: req, respondWith: (promise) => { responded = promise; } });
    return responded;
  };

  assert.equal(dispatchDev(request('https://app.example/src/main.tsx', { destination: 'script' })), undefined,
    'modules are passed straight through');
  assert.equal(dispatchDev(request('https://app.example/', { mode: 'navigate' })), undefined,
    'navigations are passed straight through');

  const image = request('https://images.example/dev-card.png', { destination: 'image' });
  assert.equal((await dispatchDev(image)).__from, 'network', 'images are still handled');
  assert.equal(imageCache().store.has('https://images.example/dev-card.png'), true,
    'and still cached, because card art is remote and immutable');
});
