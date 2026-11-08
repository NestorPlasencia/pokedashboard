import { test } from 'node:test';
import assert from 'node:assert/strict';

const { applyCollectionFilter } = await import('../src/utils/filters.ts');
const { initialCollectionFilter } = await import('../src/utils/urlState.ts');

const cards = [
  { id: 'owned', shadow: false, collections: [{ name: 'Main', quantity: { 'Near Mint': 2 } }] },
  { id: 'missing', shadow: false, collections: [] },
];
const marks = (result) => result.map((card) => [card.id, card.ownershipMark ?? null, card.shadow]);

test('Mark owned badges owned cards and keeps every card visible and undimmed', () => {
  assert.deepEqual(marks(applyCollectionFilter(cards, 'markOwned', ['Main'])),
    [['owned', 'owned', false], ['missing', null, false]]);
});

test('Mark not owned badges the missing cards instead', () => {
  assert.deepEqual(marks(applyCollectionFilter(cards, 'markNotOwned', ['Main'])),
    [['owned', null, false], ['missing', 'notOwned', false]]);
});

test('switching back to None clears the marks', () => {
  const marked = applyCollectionFilter(cards, 'markOwned', ['Main']);
  assert.deepEqual(marks(applyCollectionFilter(marked, 'none', ['Main'])),
    [['owned', null, false], ['missing', null, false]]);
});

test('the mark modes survive a URL round trip', () => {
  assert.equal(initialCollectionFilter({ viewCollectionOption: 'markNotOwned', collections: ['Main'] }).mode, 'markNotOwned');
});
