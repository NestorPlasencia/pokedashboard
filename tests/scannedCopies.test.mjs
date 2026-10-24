import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Exercise the real mutation against a disposable client; never touch a live inventory.
const source = await readFile(new URL('../src/services/appCollections.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleWithClient = async client => {
  globalThis.__scannerTestClient = client;
  const code = compiled.replace(/import \{ supabase \} from "\.\/supabase";/, 'const supabase = globalThis.__scannerTestClient;');
  return import(`data:text/javascript;base64,${Buffer.from(code + `\n// ${Math.random()}`).toString('base64')}`);
};
const scanned = { productId: 25, name: 'Pikachu', number: '58', setName: 'Base Set', printing: '1st Edition', variant: 'Normal' };

test('a retry is idempotent and another presentation adds a separate copy with the configured condition', async () => {
  const copies = new Map([['sibling', { id: 'sibling', product_id: 25, condition: 'Damaged', notes: 'Preserve me' }]]);
  const calls = [];
  const client = { from(table) { return { async upsert(payload, options) {
    calls.push({ table, payload, options });
    if (table === 'card_copies' && !copies.has(payload.id)) copies.set(payload.id, payload);
    return { error: null };
  } }; } };
  const { addScannedCopy } = await moduleWithClient(client);
  await addScannedCopy('owner-a', 'my-binder', scanned, 'Lightly Played', 'copy-1');
  await addScannedCopy('owner-a', 'my-binder', scanned, 'Lightly Played', 'copy-1');
  await addScannedCopy('owner-a', 'my-binder', scanned, 'Near Mint', 'copy-2');
  assert.equal(copies.size, 3);
  assert.deepEqual(copies.get('sibling'), { id: 'sibling', product_id: 25, condition: 'Damaged', notes: 'Preserve me' });
  assert.equal(copies.get('copy-1').condition, 'Lightly Played');
  assert.equal(copies.get('copy-2').condition, 'Near Mint');
  assert.equal(copies.get('copy-1').printing, '1st Edition');
  assert.equal(copies.get('copy-1').collection_id, 'my-binder');
  assert.equal(copies.get('copy-1').owner_id, 'owner-a');
  assert.equal(copies.get('copy-1').status, 'active');
  assert.equal(copies.get('copy-1').managed_by, null);
  assert.ok(calls.every(call => ['cards', 'card_copies'].includes(call.table)), 'no sync-owned tables or collection printings are mutated');
});

test('invalid identity, invalid condition and unavailable client never write a copy', async () => {
  let writes = 0;
  const { addScannedCopy } = await moduleWithClient({ from() { writes++; throw new Error('Unexpected write'); } });
  await assert.rejects(addScannedCopy('owner', 'binder', { ...scanned, productId: 0 }, 'Near Mint', 'id'));
  await assert.rejects(addScannedCopy('owner', 'binder', scanned, 'Mint!', 'id'));
  assert.equal(writes, 0);
  const unavailable = await moduleWithClient(null);
  await assert.rejects(unavailable.addScannedCopy('owner', 'binder', scanned, 'Near Mint', 'id'), /not configured/);
});

test('a network failure propagates for retry using the same copy identity', async () => {
  const { addScannedCopy } = await moduleWithClient({ from(table) { return { async upsert() {
    return { error: table === 'card_copies' ? new Error('Offline') : null };
  } }; } });
  await assert.rejects(addScannedCopy('owner', 'binder', scanned, 'Near Mint', 'stable-id'), /Offline/);
});
