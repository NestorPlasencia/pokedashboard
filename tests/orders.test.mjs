import { test } from 'node:test';
import assert from 'node:assert/strict';

const { orderByPokedexAndRarity } = await import('../src/utils/orders.ts');

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
