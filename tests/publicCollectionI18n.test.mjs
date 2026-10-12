import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_COLLECTION_TEXT, publicLocaleFromSearch, withPublicLocale } from '../src/utils/publicCollectionI18n.ts';

test('the initial language comes from ?lang= and defaults to English', () => {
  assert.equal(publicLocaleFromSearch(''), 'en');
  assert.equal(publicLocaleFromSearch('?lang=es'), 'es');
  assert.equal(publicLocaleFromSearch('?lang=ES-pe'), 'es');
  assert.equal(publicLocaleFromSearch('?lang=fr'), 'en');
});

test('switching language keeps the path and every other parameter', () => {
  assert.equal(withPublicLocale('http://x.test/c/abc?foo=1#top', 'es'), '/c/abc?foo=1&lang=es#top');
  assert.equal(withPublicLocale('/c/abc?lang=es', 'en'), '/c/abc?lang=en');
});

test('both languages translate every key', () => {
  const keys = locale => Object.keys(PUBLIC_COLLECTION_TEXT[locale]).sort();
  assert.deepEqual(keys('es'), keys('en'));
  assert.equal(PUBLIC_COLLECTION_TEXT.es.cards(1, String), '1 carta');
  assert.equal(PUBLIC_COLLECTION_TEXT.en.copies(2915, n => n.toLocaleString('en-US')), '2,915 copies');
});
