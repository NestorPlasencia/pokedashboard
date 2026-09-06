import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addOwnedCard,
  createOwnedCollection,
  deleteOwnedCollection,
  mergeOwnedIntoInventory,
  ownsCard,
  parseOwnedCollections,
  removeOwnedCard,
} from '../src/services/ownedCollections.ts';

const pikachu = { productId: 101, printing: 'Normal', name: 'Pikachu', setName: 'Base' };
const pikachuReverse = { productId: 101, printing: 'Reverse Holo', name: 'Pikachu', setName: 'Base' };
const withOne = (card) => [{ id: 'c1', name: 'Purchases', cards: [card] }];

test('a card is owned or not: adding it twice changes nothing', () => {
  let collections = [{ id: 'c1', name: 'Purchases', cards: [] }];
  collections = addOwnedCard(collections, 'c1', pikachu);
  const afterFirst = collections;
  collections = addOwnedCard(collections, 'c1', pikachu);

  assert.equal(collections[0].cards.length, 1);
  assert.deepEqual(collections[0].cards[0], pikachu, 'and no copy count appears');
  assert.deepEqual(collections, afterFirst);
});

test('printings of one product are tracked separately', () => {
  let collections = [{ id: 'c1', name: 'Purchases', cards: [] }];
  collections = addOwnedCard(collections, 'c1', pikachu);
  collections = addOwnedCard(collections, 'c1', pikachuReverse);

  assert.equal(collections[0].cards.length, 2, 'Normal and Reverse Holo are different cards to own');
  assert.equal(ownsCard(collections[0], pikachu), true);
  assert.equal(ownsCard(collections[0], pikachuReverse), true);
});

test('removing takes the card straight back out', () => {
  let collections = withOne(pikachu);
  collections = removeOwnedCard(collections, 'c1', pikachu);
  assert.deepEqual(collections[0].cards, []);
  assert.equal(ownsCard(collections[0], pikachu), false);

  collections = removeOwnedCard(collections, 'c1', pikachu);
  assert.deepEqual(collections[0].cards, [], 'removing what is not there is a no-op');
});

test('a card with no TCGplayer product cannot be tracked', () => {
  const collections = addOwnedCard([{ id: 'c1', name: 'Purchases', cards: [] }], 'c1', { ...pikachu, productId: undefined });
  assert.deepEqual(collections[0].cards, [], 'nothing would match it back to the catalog');
});

test('collection names must be unique, because everything downstream addresses them by name', () => {
  const collections = createOwnedCollection([], 'Purchases', 'c1');
  assert.equal(collections.length, 1);
  assert.equal(createOwnedCollection(collections, 'Purchases', 'c2'), null);
  assert.equal(createOwnedCollection(collections, '  ', 'c2'), null, 'a blank name is not a name');
  assert.equal(createOwnedCollection(collections, '  Trades  ', 'c2')[1].name, 'Trades', 'names are trimmed');
});

test('deleting a collection leaves the others untouched', () => {
  const collections = [{ id: 'c1', name: 'A', cards: [] }, { id: 'c2', name: 'B', cards: [] }];
  assert.deepEqual(deleteOwnedCollection(collections, 'c1'), [{ id: 'c2', name: 'B', cards: [] }]);
});

test('stored JSON is rebuilt tolerantly, dropping only what is malformed', () => {
  const parsed = parseOwnedCollections([
    { id: 'c1', name: 'Purchases', cards: [
      { productId: 101, printing: 'Normal', name: 'Pikachu', setName: 'Base', quantity: 2 },
      { productId: 101, printing: 'Normal', name: 'Pikachu', setName: 'Base' }, // duplicate row
      { productId: 0 },                         // not a real product
      null,
    ] },
    { id: 'c1', name: 'Duplicate id', cards: [] },
    { name: 'No id', cards: [] },
    'nonsense',
  ]);

  assert.equal(parsed.length, 1, 'only the first well-formed collection survives');
  assert.deepEqual(parsed[0].cards, [pikachu], 'and only its well-formed rows');
  assert.equal('quantity' in parsed[0].cards[0], false, 'a copy count from an older document is dropped');
  assert.deepEqual(parseOwnedCollections(null), [], 'a missing document is an empty one');
});

test('merging puts hand-kept cards into the inventory the rest of the app reads', () => {
  const collectr = {
    collectionNames: ['Binder'],
    entriesByProductId: new Map([[101, [{ collectionName: 'Binder', productName: 'Pikachu', printing: 'Normal', conditions: { 'Near Mint': 1 }, catalogGroup: 'Base' }]]]),
    activeCopyCount: 1,
    fetchedAt: 123,
  };
  const merged = mergeOwnedIntoInventory(collectr, [
    { id: 'c1', name: 'Purchases', cards: [pikachu] },
  ]);

  assert.deepEqual(merged.collectionNames, ['Binder', 'Purchases']);
  assert.equal(merged.entriesByProductId.get(101).length, 2, 'a card held in both appears under both names');
  const mine = merged.entriesByProductId.get(101).find((entry) => entry.collectionName === 'Purchases');
  assert.deepEqual(mine.conditions, { 'Near Mint': 1 }, 'a held card is exactly one copy');
  assert.equal(mine.catalogGroup, 'Base', 'so the viewed-collection series resolution can find it');
  assert.equal(merged.activeCopyCount, 2);

  // Collectr's own snapshot must not be mutated: it is cached and reused across renders.
  assert.equal(collectr.entriesByProductId.get(101).length, 1);
  assert.deepEqual(collectr.collectionNames, ['Binder']);
});

test('merging works with no Collectr inventory at all', () => {
  const merged = mergeOwnedIntoInventory(null, [{ id: 'c1', name: 'Purchases', cards: [pikachu] }]);
  assert.deepEqual(merged.collectionNames, ['Purchases']);
  assert.equal(merged.entriesByProductId.get(101).length, 1);
  assert.equal(merged.activeCopyCount, 1);
});

test('an empty collection is still listed, so it can be picked as a target', () => {
  const merged = mergeOwnedIntoInventory(null, [{ id: 'c1', name: 'Purchases', cards: [] }]);
  assert.deepEqual(merged.collectionNames, ['Purchases']);
  assert.equal(merged.entriesByProductId.size, 0);
});
