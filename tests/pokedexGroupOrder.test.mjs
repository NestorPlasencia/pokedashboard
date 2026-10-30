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

test('evolutionary groups include placeholders, regional forms, and branches with missing species', () => {
  const forms = [
    { name: 'Gardevoir', number: 282 },
    { name: 'Alolan Raichu', number: 26 },
    { name: 'Pikachu', number: 25 },
    { name: 'Pichu', number: 172 },
    { name: 'Raichu', number: 26 },
    { name: 'Ralts', number: 280 },
    { name: 'Gallade', number: 475 },
    { name: 'Surskit', number: 283 },
    { name: 'Kirlia', number: 281 },
    { name: 'Sandshrew', number: 27 },
  ];
  const groups = Object.fromEntries(forms
    .filter((form) => form.name !== 'Kirlia')
    .map((form) => [form.name, { form, cards: [{ isPlaceholder: true }] }]));
  assert.deepEqual(orderPokedexGroupNames(forms, groups, 'evolution'), [
    'Pichu', 'Pikachu', 'Alolan Raichu', 'Raichu', 'Sandshrew',
    'Ralts', 'Gardevoir', 'Gallade', 'Surskit',
  ]);
  assert.equal(forms[0].name, 'Gardevoir');
});
