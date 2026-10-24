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
