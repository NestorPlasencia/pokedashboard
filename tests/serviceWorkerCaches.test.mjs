import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('a service worker update retains report histories, data and prices while dropping obsolete shell caches', async () => {
  const handlers = new Map(), deleted = [];
  const names = ['pokedashboard-report-history-v1', 'pokedashboard-data-v1', 'pokedashboard-tcg-prices-v5', 'pokedashboard-images-v1', 'pokedashboard-app-v1', 'pokedashboard-app-v0', 'another-app'];
  const context = { URL, self: { location: { href: 'http://localhost/sw.js' }, addEventListener: (name, fn) => handlers.set(name, fn), clients: { claim: async () => {} } }, caches: { keys: async () => names, delete: async name => { deleted.push(name); return true; } } };
  vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let completion;
  handlers.get('activate')({ waitUntil: promise => { completion = promise; } });
  await completion;
  assert.deepEqual(deleted, ['pokedashboard-app-v0']);
});
