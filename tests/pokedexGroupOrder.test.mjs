import { test } from 'node:test';
import assert from 'node:assert/strict';

const { orderPokedexGroupNames } = await import('../src/utils/pokedexGroupOrder.ts');

const forms = [
  { name: 'A', number: 1 },
  { name: 'B', number: 2 },
  { name: 'C', number: 3 },
];
const card = (collections = []) => ({ collections });
const groups = {
  A: { cards: [card([{ name: 'Binder', quantity: { 'Near Mint': 3 } }])] },
  B: { cards: [card(), card()] },
  C: { cards: [card([{ name: 'Other', quantity: { Unknown: 5 } }])] },
};

test('group order sorts the full Pokédex before display pagination', () => {
  assert.deepEqual(orderPokedexGroupNames(forms, groups, 'default'), ['A', 'B', 'C']);
  assert.deepEqual(orderPokedexGroupNames(forms, groups, 'cardCountDesc'), ['B', 'A', 'C']);
  assert.deepEqual(orderPokedexGroupNames(forms, groups, 'ownedCountDesc'), ['C', 'A', 'B']);
  assert.deepEqual(orderPokedexGroupNames(forms, groups, 'ownedCountDesc', ['Binder']), ['A', 'B', 'C']);
});
