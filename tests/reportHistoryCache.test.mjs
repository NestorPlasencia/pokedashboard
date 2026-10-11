import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { clearReportHistoryCache, loadReportHistorySnapshot } from '../src/services/reportHistory.ts';
import { DATA_CACHE, REPORT_HISTORY_CACHE, readStoredValue, writeStoredValue } from '../src/services/offlineCache.ts';

const originalFetch = globalThis.fetch, originalNow = Date.now, originalWindow = globalThis.window;
const disks = new Map();
class FakeCache {
  entries = new Map();
  async match(key) { return this.entries.get(String(key))?.clone(); }
  async put(key, response) { this.entries.set(String(key), response.clone()); }
  async keys() { return [...this.entries.keys()]; }
  async delete(key) { return this.entries.delete(String(key)); }
}
globalThis.window = { location: { origin: 'http://localhost' }, caches: {
  open: async name => { if (!disks.has(name)) disks.set(name, new FakeCache()); return disks.get(name); },
  delete: async name => disks.delete(name),
} };
const signal = () => new AbortController().signal;
let calls;
const response = ids => ({ ok: true, json: async () => ({ points: ids.map(id => ({ productId: id, total: 1, data: [{ date: '2026-10-10', condition: 'Near Mint', printing: 'Holofoil', marketPrice: 20 }] })) }) });
beforeEach(async () => {
  Date.now = originalNow; await clearReportHistoryCache(); disks.clear(); calls = [];
  globalThis.fetch = async (_url, options) => { const ids = JSON.parse(options.body).ids; calls.push(ids); return response(ids); };
});
after(() => { Date.now = originalNow; globalThis.fetch = originalFetch; globalThis.window = originalWindow; });

test('history persists across module reloads and overlapping reports reuse products', async () => {
  const first = await loadReportHistorySnapshot([1, 2, 1], 'Near Mint', signal());
  assert.equal(first.fetchedProducts, 2);
  const reload = await import('../src/services/reportHistory.ts?cache-reload');
  const second = await reload.loadReportHistorySnapshot([2, 3], 'Near Mint', signal());
  assert.deepEqual(calls, [[1, 2], [3]]);
  assert.equal(second.cachedProducts, 1); assert.equal(second.fetchedProducts, 1);
  assert.deepEqual(second.rows.map(row => row.productId), [2, 3]);
});

test('expired offline history keeps its original timestamp and explicitly reports stale', async () => {
  const first = await loadReportHistorySnapshot([1], 'Near Mint', signal());
  Date.now = () => first.storedAt + 16 * 60000;
  globalThis.fetch = async () => { throw new Error('offline'); };
  const second = await loadReportHistorySnapshot([1], 'Near Mint', signal());
  assert.equal(second.stale, true); assert.equal(second.storedAt, first.storedAt);
  assert.deepEqual(second.rows, first.rows);
  const controller = new AbortController();
  globalThis.fetch = async () => { controller.abort(); throw new DOMException('aborted', 'AbortError'); };
  await assert.rejects(loadReportHistorySnapshot([1], 'Near Mint', controller.signal), { name: 'AbortError' });
});

test('clear removes disk and memory, preserves other data, and cancels pending writes', async () => {
  await writeStoredValue('inventory-user', { copies: ['private'] });
  await loadReportHistorySnapshot([1], 'Near Mint', signal());
  await clearReportHistoryCache();
  assert.equal(disks.has(REPORT_HISTORY_CACHE), false);
  assert.deepEqual((await readStoredValue('inventory-user', DATA_CACHE)).value, { copies: ['private'] });
  await loadReportHistorySnapshot([1], 'Near Mint', signal());
  assert.equal(calls.length, 2, 'memory is also cleared');
  let release, started;
  const start = new Promise(resolve => { started = resolve; });
  globalThis.fetch = async () => { started(); return new Promise(resolve => { release = resolve; }); };
  const pending = loadReportHistorySnapshot([2], 'Near Mint', signal());
  await start; await clearReportHistoryCache(); release(response([2]));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(disks.has(REPORT_HISTORY_CACHE), false, 'late network completion never repopulates cleared storage');
});

test('an omitted product is not silently saved as an empty history, and conditions have separate keys', async () => {
  await loadReportHistorySnapshot([1], 'Near Mint', signal());
  await loadReportHistorySnapshot([1], 'Lightly Played', signal());
  assert.equal(calls.length, 2);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ points: [] }) });
  await assert.rejects(loadReportHistorySnapshot([2], 'Near Mint', signal()), /todas las cartas/);
  assert.equal(await readStoredValue('Near Mint:2', REPORT_HISTORY_CACHE), null);
});

test('persistent history is bounded by size so old entries yield to new histories', async () => {
  await writeStoredValue('old', [], REPORT_HISTORY_CACHE);
  const disk = disks.get(REPORT_HISTORY_CACHE);
  disk.entries.set('old-huge', new Response('[]', { headers: { 'x-pokedashboard-size': String(101 * 1024 * 1024), 'x-pokedashboard-stored-at': '1' } }));
  await loadReportHistorySnapshot([1], 'Near Mint', signal());
  assert.equal(disk.entries.has('old-huge'), false);
  assert.ok(await readStoredValue('Near Mint:1', REPORT_HISTORY_CACHE));
});
