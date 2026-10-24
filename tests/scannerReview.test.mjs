import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readScannerReview, saveScannerReview, scannerReviewKey } from '../src/services/scannerReview.ts';

const draft = {
  id: 'stable-copy-id', candidates: [{ id: 'pikachu', name: 'Pikachu', setName: 'Base Set', number: '58/102', variant: 'Normal', image: 'https://example.com/card.png' }],
  cardId: 'pikachu', condition: 'Lightly Played', collectionId: 'binder', approved: true, note: 'Review required', createdAt: '2026-10-24T00:00:00Z',
};

test('scanning drafts persist locally without changing copy attributes or approving a restored batch', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  saveScannerReview(storage, 'owner-a', [draft]);
  const restored = readScannerReview(storage, 'owner-a');
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, draft.id, 'save retries retain the copy identity');
  assert.equal(restored[0].condition, 'Lightly Played');
  assert.equal(restored[0].collectionId, 'binder');
  assert.equal(restored[0].approved, false, 'restoration never implicitly approves cloud writes');
  assert.equal(draft.approved, true, 'restoring does not mutate the source');
  assert.deepEqual(readScannerReview(storage, 'owner-b'), []);
  assert.deepEqual(readScannerReview(storage, ''), []);
  assert.notEqual(scannerReviewKey('owner-a'), scannerReviewKey(''));
});

test('corrupt draft backups are reported rather than silently overwritten', () => {
  for (const raw of ['{', '{}', '[null]', JSON.stringify([{ ...draft, condition: 'Mint!' }]), JSON.stringify([{ ...draft, candidates: [null] }])]) {
    assert.throws(() => readScannerReview({ getItem: () => raw }, 'owner'));
  }
});
