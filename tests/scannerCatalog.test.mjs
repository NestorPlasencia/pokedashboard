import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scannerCatalogCards } from '../src/utils/scannerCatalog.ts';

test('scanner uses only final catalog results and excludes both placeholder types', () => {
  const gastly = { id: 'gastly', setId: 'base2', printing: 'Normal', variant: 'Normal', name: 'Gastly' };
  const results = [gastly, { id: 'pokemon-1', isPlaceholder: true }, { id: 'form-1', isPlaceholder: true, formName: 'Alolan' }];
  assert.deepEqual(scannerCatalogCards(results), [gastly]);
  assert.deepEqual(scannerCatalogCards([]), []);
});

test('deduplication keeps distinct printings and never adds filtered-out products', () => {
  const normal = { id: 'gastly', setId: 'base2', printing: 'Normal', variant: 'Normal' };
  const firstEdition = { ...normal, printing: '1st Edition' };
  assert.deepEqual(scannerCatalogCards([normal, { ...normal }, firstEdition]), [normal, firstEdition]);
  assert.deepEqual(scannerCatalogCards([firstEdition]), [firstEdition]);
});
