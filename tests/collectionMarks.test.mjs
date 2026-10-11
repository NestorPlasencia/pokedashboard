import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCollectionMarkIndex, collectionMarksForCard, collectionMarkClass } from '../src/utils/collectionMarks.ts';
import { applyCollectionFilter } from '../src/utils/filters.ts';

const collections = [
  { id: 'owned', name: 'Hits', kind: 'owned', parentId: null },
  { id: 'wish', name: 'Búsqueda', kind: 'wishlist', parentId: null },
  { id: 'child', name: 'Maclean', kind: 'wishlist', parentId: 'wish' },
  { id: 'grandchild', name: 'Promos', kind: 'wishlist', parentId: 'child' },
];
const entry = (name, quantity = { Unknown: 1 }) => ({ name, quantity });

test('marking a wishlist includes descendants and deduplicates overlapping scopes', () => {
  const index = buildCollectionMarkIndex(collections, ['Búsqueda', 'Búsqueda', 'Maclean']);
  const card = { collections: [entry('Maclean'), entry('Promos'), entry('Promos')] };
  assert.deepEqual(collectionMarksForCard(card, index), [
    { name: 'Búsqueda', kind: 'wishlist' }, { name: 'Maclean', kind: 'wishlist' },
  ]);
  assert.equal(collectionMarkClass(collectionMarksForCard(card, index)), ' collection-marked collection-marked--wish');
});

test('only positive active membership is marked; missing, deleted and unrelated collections are ignored', () => {
  const index = buildCollectionMarkIndex(collections, ['Hits', 'deleted']);
  assert.deepEqual(collectionMarksForCard({ collections: [entry('Hits', { Unknown: 0 })] }, index), []);
  assert.deepEqual(collectionMarksForCard({ collections: [entry('Promos')] }, index), []);
  assert.deepEqual(collectionMarksForCard({}, index), []);
  assert.deepEqual(collectionMarksForCard({ collections: [entry('deleted')] }, index), []);
  assert.deepEqual(collectionMarksForCard({ collections: [entry('Hits', { 'Damaged': 1 })] }, index), [{ name: 'Hits', kind: 'owned' }]);
});

test('wishlist marks annotate results independently of the owned collection filter', () => {
  const ownedWanted = { id: 'owned-wanted', collections: [entry('Hits'), entry('Promos')] };
  const missingWanted = { id: 'missing-wanted', collections: [entry('Promos')] };
  const unrelated = { id: 'unrelated', collections: [] };
  const cards = [ownedWanted, missingWanted, unrelated];
  const before = structuredClone(cards);
  const filtered = applyCollectionFilter(cards, 'hideOwned', ['Hits'], 1, ['All']);
  const index = buildCollectionMarkIndex(collections, ['Búsqueda']);
  const annotations = filtered.map(card => collectionMarksForCard(card, index));
  assert.deepEqual(filtered.map(card => card.id), ['missing-wanted', 'unrelated']);
  assert.deepEqual(annotations, [[{ name: 'Búsqueda', kind: 'wishlist' }], []]);
  assert.deepEqual(cards, before, 'marking must not change quantities, dimming, data or ordering');
  assert.deepEqual(collectionMarksForCard(missingWanted, buildCollectionMarkIndex(collections, [])), []);
});
