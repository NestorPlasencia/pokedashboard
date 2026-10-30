import { test } from 'node:test';
import assert from 'node:assert/strict';

const { orderByPokedexAndRarity, orderByRariTies, orderByPokedexEvolution, orderToSortConfig, ORDER_OPTIONS } = await import('../src/utils/orders.ts');
const { applySorting } = await import('../src/utils/filters.ts');

test('Pokédex and rarity sorts by Pokédex first, then rarity within each Pokémon', () => {
  const cards = [
    { id: 'dex-2-common', nationalPokedexNumbers: [2], rarity: 'Common' },
    { id: 'dex-1-rare', nationalPokedexNumbers: [1], rarity: 'Rare' },
    { id: 'no-dex', nationalPokedexNumbers: [], rarity: 'Common' },
    { id: 'dex-1-uncommon', nationalPokedexNumbers: [1], rarity: 'Uncommon' },
    { id: 'dex-1-common', nationalPokedexNumbers: [1], rarity: 'Common' },
  ];

  assert.deepEqual(orderByPokedexAndRarity(cards).map((card) => card.id), [
    'dex-1-common', 'dex-1-uncommon', 'dex-1-rare', 'dex-2-common', 'no-dex',
  ]);
  assert.equal(cards[0].id, 'dex-2-common', 'sorting does not mutate the source list');
});

test('a non-promo rarity wins over Promo when sorting cards', () => {
  const cards = [
    { id: 'v', nationalPokedexNumbers: [1], rarity: 'Promo', rarities: ['Promo', 'Rare Holo V'] },
    { id: 'promo', nationalPokedexNumbers: [1], rarity: 'Real Promo', rarities: ['Real Promo'] },
    { id: 'holo', nationalPokedexNumbers: [1], rarity: 'Promo', rarities: ['Rare Holo', 'Promo'] },
    { id: 'rare', nationalPokedexNumbers: [1], rarity: 'Rare', rarities: ['Rare', 'Promo'] },
  ];

  const expected = ['rare', 'holo', 'v', 'promo'];
  assert.deepEqual(orderByRariTies(cards).map((card) => card.id), expected);
  assert.deepEqual(orderByPokedexAndRarity(cards).map((card) => card.id), expected);
});

test('evolutionary Pokédex keeps babies and cross-generation evolutions with their national family', () => {
  const numbers = [27, 26, 25, 24, 172, 42, 43, 169, 41, 36, 173, 35, 23];
  const cards = numbers.map((number) => ({ id: String(number), nationalPokedexNumbers: [number] }));
  assert.deepEqual(orderByPokedexEvolution(cards).map((card) => card.nationalPokedexNumbers[0]),
    [23, 24, 172, 25, 26, 27, 173, 35, 36, 41, 42, 169, 43]);
  assert.deepEqual(cards.map((card) => card.nationalPokedexNumbers[0]), numbers);
});

test('evolutionary Pokédex includes every branch and later evolutions without the base in the results', () => {
  const cards = [1000, 471, 196, 134, 135, 136, 133, 197, 470, 700, 999, 979, 58, 57]
    .map((number) => ({ nationalPokedexNumbers: [number] }));
  assert.deepEqual(orderByPokedexEvolution(cards).map((card) => card.nationalPokedexNumbers[0]),
    [57, 979, 58, 133, 134, 135, 136, 196, 197, 470, 471, 700, 999, 1000]);
});

test('the menu configuration reaches the sorting pipeline and preserves same-species variants', () => {
  const cards = [
    { id: 'trainer', nationalPokedexNumbers: [] },
    { id: 'raichu', nationalPokedexNumbers: [26] },
    { id: 'pikachu-holo', nationalPokedexNumbers: [25] },
    { id: 'pichu', nationalPokedexNumbers: [172] },
    { id: 'pikachu-normal', nationalPokedexNumbers: [25] },
    { id: 'energy' },
  ];
  const option = 'Pokédex evolutiva';
  assert.ok(ORDER_OPTIONS.includes(option));
  const config = orderToSortConfig(option);
  assert.equal(config.field, 'pokedexEvolution');
  assert.deepEqual(applySorting(cards, config.field, config.direction).map((card) => card.id),
    ['pichu', 'pikachu-holo', 'pikachu-normal', 'raichu', 'trainer', 'energy']);
});
