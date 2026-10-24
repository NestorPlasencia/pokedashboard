import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Exercise the real mutation against an in-memory table; never touch a live inventory.
const source = await readFile(new URL('../src/services/appCollections.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const load = async client => {
  globalThis.__copyCountsClient = client;
  const code = compiled.replace(/import \{ supabase \} from "\.\/supabase";/, 'const supabase = globalThis.__copyCountsClient;');
  return import(`data:text/javascript;base64,${Buffer.from(code + `\n// ${Math.random()}`).toString('base64')}`);
};

/** A tiny card_copies table that understands the filters setCopyCounts uses. */
const fakeClient = rows => {
  let next = 0;
  const query = (filters = [], action = 'select') => ({
    eq(column, value) { return query([...filters, row => row[column] === value], action); },
    is(column, value) { return query([...filters, row => row[column] === value], action); },
    in(column, values) { return query([...filters, row => values.includes(row[column])], action); },
    then(resolve) {
      const matched = rows.filter(row => filters.every(filter => filter(row)));
      if (action === 'delete') for (const row of matched) rows.splice(rows.indexOf(row), 1);
      resolve({ data: matched.map(row => ({ ...row })), error: null });
    },
  });
  return { from(table) {
    if (table === 'cards') return { upsert: async () => ({ error: null }) };
    return {
      select: () => query(),
      delete: () => query([], 'delete'),
      insert: async payload => { for (const row of payload) rows.push({ id: `new-${next++}`, ...row }); return { error: null }; },
    };
  } };
};

const card = { productId: 45160, name: 'Nidoran ♀', number: '57/64', setName: 'Jungle', printing: 'Unlimited', variant: 'Normal' };
const copy = (id, condition, patch = {}) => ({ id, owner_id: 'me', collection_id: 'woc', product_id: 45160, printing: 'Unlimited', condition, status: 'active', managed_by: null, ...patch });
const conditions = rows => rows.filter(row => row.collection_id === 'woc' && row.managed_by === null).map(row => row.condition ?? 'Unknown').sort();

test('copies are added, removed and moved between conditions to match the counts', async () => {
  const rows = [copy('a', 'Near Mint'), copy('b', 'Near Mint'), copy('c', 'Damaged'), copy('managed', 'Near Mint', { managed_by: 'collectr' })];
  const { setCopyCounts } = await load(fakeClient(rows));
  await setCopyCounts('me', 'woc', card, { 'Near Mint': 1, Damaged: 0, 'Lightly Played': 2 });
  assert.deepEqual(conditions(rows), ['Lightly Played', 'Lightly Played', 'Near Mint']);
  assert.ok(rows.some(row => row.id === 'managed'), 'rows another service manages are left alone');
  assert.ok(rows.filter(row => row.id.startsWith('new-')).every(row => row.printing === 'Unlimited' && row.status === 'active'));
});

test('counts are absolute, so repeating a save changes nothing', async () => {
  const rows = [copy('a', null)];
  const { setCopyCounts } = await load(fakeClient(rows));
  await setCopyCounts('me', 'woc', card, { Unknown: 0, 'Near Mint': 2 });
  await setCopyCounts('me', 'woc', card, { Unknown: 0, 'Near Mint': 2 });
  assert.deepEqual(conditions(rows), ['Near Mint', 'Near Mint']);
});

test("the copies' own printing overrides the catalog card's label", async () => {
  const rows = [copy('a', 'Near Mint', { printing: null })];
  const { setCopyCounts } = await load(fakeClient(rows));
  await setCopyCounts('me', 'woc', card, { 'Near Mint': 0 }, null);
  assert.equal(rows.length, 0);
});
