import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareEvolutionaryPokedexNumbers as compare } from '../src/utils/pokedexEvolution.ts';

test('evolution branches follow their parent, including babies introduced after evolved species', () => {
  assert.deepEqual([237, 107, 106, 236].sort(compare), [236, 106, 107, 237]);
  assert.deepEqual([478, 362, 361].sort(compare), [361, 362, 478]);
  assert.deepEqual([900, 123, 212].sort(compare), [123, 212, 900]);
  assert.deepEqual([102, 866, 122, 439].sort(compare), [102, 439, 122, 866]);
});

test('single-stage and unknown species use national order and invalid numbers go last', () => {
  assert.deepEqual([2000, 151, 150, 144].sort(compare), [144, 150, 151, 2000]);
  for (const value of [undefined, NaN, 0, -1, 1.5, Infinity]) {
    assert.ok(compare(value, 1025) > 0);
    assert.equal(compare(value, undefined), 0);
  }
  assert.equal(compare(25, 25), 0);
  // A breeding relationship is not an evolution.
  assert.ok(compare(489, 490) < 0);
});
