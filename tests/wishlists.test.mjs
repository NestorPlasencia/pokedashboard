import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteWishlistNode, restoreWishlistNode, reorderSubcollections, mergeSavedCards, parseWishlists, readWishlists, storageKey } from '../src/services/wishlists.ts';

test('bulk additions preserve variants, eras and order without duplicates', () => {
  const first = { id: '25-normal', era: 'Scarlet & Violet' };
  const reverse = { id: '25-reverse', era: 'Scarlet & Violet' };
  const otherEra = { id: '25-normal', era: 'Sword & Shield' };
  const existing = [first];
  assert.deepEqual(mergeSavedCards(existing, [first, reverse, otherEra, reverse]), [first, reverse, otherEra]);
  assert.deepEqual(existing, [first]);
});

test('empty results leave saved cards intact and incomplete references are excluded', () => {
  const cards = [{ id: '25-normal', era: 'Scarlet & Violet' }];
  assert.deepEqual(mergeSavedCards(cards, []), cards);
  assert.deepEqual(mergeSavedCards(cards, [{ id: 'bad', era: '' }]), cards);
});

test('saved hierarchy survives a JSON round trip with final IDs and eras', () => {
  const data = [{ id: 'wishlist', name: 'Wants', subcollections: [{ id: 'sub', name: 'Pikachu', cards: [{ id: '25-reverse', era: 'Scarlet & Violet' }] }] }];
  const storage = { getItem: key => { assert.equal(key, storageKey); return JSON.stringify(data); } };
  assert.deepEqual(readWishlists(storage), data);
  assert.deepEqual(readWishlists({ getItem: () => null }), []);
});

test('parseWishlists validates payloads coming from Supabase, not just localStorage', () => {
  const data = [{ id: 'c', name: 'Wants', subcollections: [{ id: 's', name: 'Pikachu', cards: [{ id: '25-reverse', era: 'Scarlet & Violet' }] }] }];
  assert.deepEqual(parseWishlists(data), data);
  assert.deepEqual(parseWishlists([]), []);
  assert.throws(() => parseWishlists(null));
  assert.throws(() => parseWishlists({}));
  assert.throws(() => parseWishlists([{ id: 'c', name: 'x', subcollections: [{ id: 's', name: 's', cards: [{ id: '25' }] }] }]));
});

test('corrupt or incompatible saved data is rejected rather than silently discarded', () => {
  for (const raw of ['{', '{}', '[null]', '[{"id":"c","name":"x","subcollections":[null]}]', '[{"id":"c","name":"x","subcollections":[{"id":"s","name":"s","cards":[{"id":"25"}]}]}]']) {
    assert.throws(() => readWishlists({ getItem: () => raw }));
  }
});


test('deleting a wishlist and undoing preserves its subtree and later wishlists', () => {
  const wishlist = { id: 'c', name: 'Wishlist', subcollections: [{ id: 's', name: 'Favorites', cards: [{ id: '25', era: 'SV' }] }] };
  const other = { id: 'other', name: 'Other', subcollections: [] };
  const result = deleteWishlistNode([wishlist], 'c');
  assert.deepEqual(result.wishlists, []);
  assert.deepEqual(restoreWishlistNode([other], result.deleted), [other, wishlist]);
  assert.equal(wishlist.subcollections[0].cards.length, 1);
});

test('reordering subcollections swaps neighbors and respects the edges', () => {
  const a = { id: 'a', name: 'A', cards: [] };
  const b = { id: 'b', name: 'B', cards: [] };
  const c = { id: 'c', name: 'C', cards: [] };
  const wishlist = { id: 'col', name: 'Wishlist', subcollections: [a, b, c] };
  const other = { id: 'other', name: 'Other', subcollections: [] };
  const wishlists = [wishlist, other];

  const movedDown = reorderSubcollections(wishlists, 'col', 'a', 'down');
  assert.deepEqual(movedDown[0].subcollections, [b, a, c]);
  assert.deepEqual(movedDown[1], other);

  const movedUp = reorderSubcollections(wishlists, 'col', 'c', 'up');
  assert.deepEqual(movedUp[0].subcollections, [a, c, b]);

  assert.deepEqual(reorderSubcollections(wishlists, 'col', 'a', 'up'), wishlists);
  assert.deepEqual(reorderSubcollections(wishlists, 'col', 'c', 'down'), wishlists);
  assert.deepEqual(reorderSubcollections(wishlists, 'col', 'missing', 'down'), wishlists);
  assert.deepEqual(reorderSubcollections(wishlists, 'missing-wishlist', 'a', 'down'), wishlists);
});

test('undo subcollection deletion preserves additions to its siblings', () => {
  const sub = { id: 's', name: 'Favorites', cards: [{ id: '25', era: 'SV' }] };
  const wishlist = { id: 'c', name: 'Wishlist', subcollections: [sub] };
  const result = deleteWishlistNode([wishlist], 'c', 's');
  assert.deepEqual(result.wishlists[0].subcollections, []);
  const sibling = { id: 'later', name: 'Later', cards: [] };
  const changed = [{ ...result.wishlists[0], subcollections: [sibling] }];
  const restored = restoreWishlistNode(changed, result.deleted);
  assert.deepEqual(restored[0].subcollections, [sibling, sub]);
  assert.deepEqual(restoreWishlistNode(restored, result.deleted), restored);
  assert.equal(deleteWishlistNode(changed, 'c', 'missing'), null);
});
