import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectionGroupIds, collectionScopeNames, ownedCollectionAddTargets } from '../src/utils/collectionTree.ts';

const collections = [
  { id: 'group', name: 'Proyectos', parentId: null, kind: 'owned', editable: true },
  { id: 'nested', name: 'Paldea', parentId: 'group', kind: 'owned', editable: true },
  { id: 'leaf', name: 'Binder', parentId: 'nested', kind: 'owned', editable: true },
  { id: 'root-leaf', name: 'Reserva', parentId: null, kind: 'owned', editable: true },
  { id: 'readonly', name: 'Collectr', parentId: null, kind: 'owned', editable: false },
  { id: 'wish', name: 'Deseadas', parentId: null, kind: 'wishlist', editable: true },
];

test('Add accepts only editable owned leaves at any depth', () => {
  assert.deepEqual(ownedCollectionAddTargets(collections).map(collection => collection.id), ['leaf', 'root-leaf']);
  assert.deepEqual([...collectionGroupIds(collections)], ['group', 'nested']);
  assert.equal(ownedCollectionAddTargets(collections).find(collection => collection.id === 'group'), undefined,
    'a restored group destination must not resolve to a writable collection');
});

test('adding a child makes the previous leaf unavailable without selecting a descendant', () => {
  const expanded = [...collections, { id: 'readonly-child', name: 'Sync', parentId: 'root-leaf', kind: 'owned', editable: false }];
  assert.deepEqual(ownedCollectionAddTargets(expanded).map(collection => collection.id), ['leaf']);
  assert.deepEqual(ownedCollectionAddTargets(collections).map(collection => collection.id), ['leaf', 'root-leaf']);
  assert.deepEqual(ownedCollectionAddTargets([...collections, { id: '', name: 'Invalid', parentId: null, kind: 'owned', editable: true }]).map(collection => collection.id), ['leaf', 'root-leaf']);
});

test('group viewing and marking still cover the group and all its descendants', () => {
  assert.deepEqual(collectionScopeNames(collections, 'Proyectos'), ['Proyectos', 'Paldea', 'Binder']);
  assert.deepEqual(collectionScopeNames(collections, 'Binder'), ['Binder']);
});
