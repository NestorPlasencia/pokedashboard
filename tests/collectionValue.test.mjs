import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCollectionPriceTotal, ownedConditionPrices } from '../src/utils/collectionValue.ts';

const kingler = {
  name: 'Kingler',
  prices: { 'Near Mint': 1.11, 'Lightly Played': 0.53, 'Moderately Played': 0.3, 'Heavily Played': 0.34, Damaged: 0.22 },
  collections: [
    { name: 'Woc DC', quantity: { Damaged: 1 } },
    { name: 'Binder', quantity: { 'Near Mint': 2, Damaged: 1 } },
  ],
};

test('a damaged copy is priced as damaged', () => {
  assert.deepEqual(ownedConditionPrices(kingler, ['Woc DC']), [{ condition: 'Damaged', copies: 1, price: 0.22 }]);
});

test('copies in several conditions list each price, best condition first', () => {
  assert.deepEqual(ownedConditionPrices(kingler, ['Woc DC', 'Binder']), [
    { condition: 'Near Mint', copies: 2, price: 1.11 },
    { condition: 'Damaged', copies: 2, price: 0.22 },
  ]);
  assert.deepEqual(ownedConditionPrices(kingler, ['Woc DC', 'Binder'], ['Near Mint']).map(item => item.condition), ['Near Mint']);
});

test('per-condition values add up to the collection value the summary shows', () => {
  const rows = ownedConditionPrices(kingler, ['Woc DC', 'Binder']);
  const sum = rows.reduce((total, row) => total + row.price * row.copies, 0);
  assert.ok(Math.abs(sum - getCollectionPriceTotal(kingler, ['Woc DC', 'Binder'])) < 1e-9);
  const noCondition = { ...kingler, prices: { 'Lightly Played': 0.53 }, collections: [{ name: 'Woc DC', quantity: { Unknown: 1, Damaged: 1 } }] };
  assert.deepEqual(ownedConditionPrices(noCondition, ['Woc DC']).map(row => [row.condition, row.price]), [['Damaged', 0.53], ['Unknown', 0.53]],
    'a missing condition price falls back to the best one, as the summary does');
});

test('a collection sorts by its copies condition price, not by Near Mint', async () => {
  const { ownedSortPrice } = await import('../src/utils/collectionValue.ts');
  const { orderByPriceDesc } = await import('../src/utils/orders.ts');
  const pidgeot = { name: 'Pidgeot', prices: { 'Near Mint': 9, Damaged: 1.45 }, collections: [{ name: 'Toyland', quantity: { Damaged: 1 } }] };
  const togepi = { name: 'Togepi', prices: { 'Near Mint': 5, Damaged: 2.85 }, collections: [{ name: 'Toyland', quantity: { Damaged: 1 } }] };
  const pikachu = { name: 'Pikachu', prices: { 'Near Mint': 11.36, 'Moderately Played': 2.27 }, collections: [{ name: 'Toyland', quantity: { 'Near Mint': 2, 'Moderately Played': 1 } }] };
  assert.deepEqual(orderByPriceDesc([pidgeot, togepi, pikachu]).map(card => card.name), ['Pikachu', 'Pidgeot', 'Togepi'], 'Near Mint order');
  const byCopies = orderByPriceDesc([pidgeot, togepi, pikachu], card => ownedSortPrice(card, ['Toyland']));
  assert.deepEqual(byCopies.map(card => card.name), ['Pikachu', 'Togepi', 'Pidgeot'], 'the most valuable copy decides, in its own condition');
  assert.equal(ownedSortPrice({ name: 'Mew', prices: { 'Lightly Played': 3 }, collections: [] }, ['Toyland']), 3, 'no copies falls back to the best price');
});
