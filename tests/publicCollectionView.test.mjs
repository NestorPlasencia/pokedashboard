import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_PUBLIC_COLLECTION_FILTERS as empty,
  publicCollectionResults as results,
  publicCollectionFilterOptions as options,
} from '../src/utils/publicCollectionView.ts';

const card = (product_id, fields = {}) => ({
  product_id, name: `Card ${product_id}`, set_name: 'Set A', number: String(product_id),
  rarity: 'Common', image_url: null, printing: 'Normal', condition: null, language: null,
  quantity: 1, ...fields,
});

test('search combines words across names, accented set names and collector numbers', () => {
  const cards = [card(1, { name: 'Pikachu', set_name: 'Pokémon GO', number: '028/078' }), card(2)];
  assert.deepEqual(results(cards, '  PIKACHU pokemon #028  ', empty, 'name-asc').map(c => c.product_id), [1]);
  assert.equal(results(cards, 'pikachu Set A', empty, 'name-asc').length, 0);
});

test('facets and search intersect without filtering or changing copy quantities', () => {
  const cards = [
    card(1, { name: 'Absol', printing: 'Reverse Holofoil', rarity: 'Rare', quantity: 3 }),
    card(2, { name: 'Absol', printing: 'Normal', rarity: 'Rare', quantity: 2 }),
    card(3, { name: 'Absol', printing: 'Reverse Holofoil', rarity: 'Rare', quantity: 1 }),
  ];
  const filters = { ...empty, set_name: 'value:Set A', rarity: 'value:Rare', printing: 'value:Reverse Holofoil' };
  const selected = results(cards, 'absol', filters, 'name-asc');
  assert.deepEqual(selected.map(c => [c.product_id, c.quantity]), [[1, 3], [3, 1]]);
  assert.equal('quantity' in empty, false);
  assert.equal(cards.length, 3);
  assert.equal(cards[0].quantity, 3);
});

test('missing metadata is filterable and distinct from a real label called missing', () => {
  const cards = [card(1), card(2, { condition: '' }), card(3, { condition: 'missing', language: 'Spanish' })];
  assert.deepEqual(results(cards, '', { ...empty, condition: 'missing' }, 'name-asc').map(c => c.product_id), [1, 2]);
  assert.deepEqual(results(cards, '', { ...empty, condition: 'value:missing', language: 'value:Spanish' }, 'name-asc').map(c => c.product_id), [3]);
});

test('printing options preserve the canonical order, unknown labels and missing values', () => {
  const cards = ['Normal', 'Custom', null, 'Reverse Holofoil', 'Holofoil', 'Normal'].map((printing, i) => card(i, { printing }));
  assert.deepEqual(options(cards, ['Holofoil', 'Reverse Holofoil', 'Normal']).printing.map(o => o.label),
    ['Holofoil', 'Reverse Holofoil', 'Normal', 'Custom', 'Not specified']);
});

test('Pokédex order sorts by number with Trainers and Energy last', () => {
  const cards = [card(1, { name: 'Pikachu' }), card(2, { name: 'Professor' }), card(3, { name: 'Bulbasaur' }), card(4, { name: 'Energy' })];
  const pokedex = new Map([[cards[0], 25], [cards[2], 1]]);
  assert.deepEqual(results(cards, '', empty, 'pokedex', new Map(), pokedex).map(c => c.product_id), [3, 1, 4, 2]);
  assert.equal(cards[0].product_id, 1, 'the original RPC result is not reordered');
});

test('collector numbers still sort naturally within a set', () => {
  const cards = [card(1, { number: '100/200' }), card(2, { number: '9/200' }), card(3, { number: null }), card(4, { number: 'TG10/TG30' }), card(5, { number: 'TG2/TG30' })];
  assert.deepEqual(results(cards, '', empty, 'set-number').map(c => c.product_id), [2, 1, 5, 4, 3]);
});

test('set, name and rarity ordering use public fields, with unknown rarities after known ones', () => {
  const cards = [card(1, { name: 'Zubat', set_name: 'Set B', rarity: 'Custom' }), card(2, { name: 'Absol', number: '10', rarity: 'Rare' }), card(3, { name: 'Eevee', number: '2', rarity: 'Uncommon' })];
  assert.deepEqual(results(cards, '', empty, 'set-number').map(c => c.product_id), [3, 2, 1]);
  assert.deepEqual(results(cards, '', empty, 'rarity').map(c => c.product_id), [3, 2, 1]);
  assert.deepEqual(results(cards, '', empty, 'name-desc').map(c => c.product_id), [1, 3, 2]);
  assert.deepEqual(results([], 'anything', empty, 'name-asc'), []);
});
