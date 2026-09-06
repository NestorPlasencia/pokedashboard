import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// The URL helpers read window.location and write through history.replaceState, so a
// minimal stand-in is enough to drive a real write/read cycle.
globalThis.window = {
  location: { search: '', pathname: '/' },
  history: {
    replaceState: (_state, _title, url) => {
      globalThis.window.location.search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    },
  },
};

const { parseUrlParams, updateUrlParams, generateUrlParams } = await import('../src/utils/urlParams.ts');
const { parseViewModeFromUrl, viewModeToParams } = await import('../src/utils/viewMode.ts');
const {
  initialPriceRange, initialSortConfig, initialViewOptions, initialPokemonGrouping,
  viewOptionsToParams, initialFilterSettings, filterSettingsToParams,
} = await import('../src/utils/urlState.ts');

const setUrl = (search) => { globalThis.window.location.search = search; };
beforeEach(() => setUrl(''));

const FILTER_DEFAULTS = {
  excludedValues: [], includeMode: 'ANY', excludeMode: 'NOT_ANY',
  singleIncludeMatch: 'CONTAINS', hideZeroCount: false,
};

test('a view mode survives a write and read of the URL', () => {
  for (const mode of [
    { kind: 'catalog' },
    { kind: 'wishlist', wishlistId: 'w-1', subcollectionId: 's-2' },
    { kind: 'wishlist', wishlistId: 'w-1', subcollectionId: '' },
    { kind: 'collection', name: 'Binder One' },
  ]) {
    setUrl('');
    updateUrlParams(viewModeToParams(mode));
    assert.deepEqual(parseViewModeFromUrl(), mode, `round trip for ${mode.kind}`);
  }
});

test('switching view mode leaves nothing of the previous one behind', () => {
  updateUrlParams(viewModeToParams({ kind: 'wishlist', wishlistId: 'w-1', subcollectionId: 's-2' }));
  updateUrlParams(viewModeToParams({ kind: 'collection', name: 'Binder One' }));
  assert.equal(window.location.search, '?viewMode=collection&viewedCollection=Binder_One');
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'collection', name: 'Binder One' });

  updateUrlParams(viewModeToParams({ kind: 'catalog' }));
  assert.equal(window.location.search, '', 'the catalog is the default and writes nothing');
});

test('the collections filter and the viewed collection stay independent', () => {
  updateUrlParams({ collections: ['Binder One', 'Deck Box'] });
  updateUrlParams(viewModeToParams({ kind: 'collection', name: 'Deck Box' }));
  assert.deepEqual(parseUrlParams().collections, ['Binder One', 'Deck Box']);
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'collection', name: 'Deck Box' });
});

test('defaults never appear in the URL', () => {
  assert.equal(generateUrlParams(viewOptionsToParams(initialViewOptions())), '');
  updateUrlParams({ series: ['All'], ...filterSettingsToParams('series', FILTER_DEFAULTS) });
  assert.equal(window.location.search, '');
});

test('view options survive a write and read of the URL', () => {
  const custom = {
    displayMode: 'trendUngrouped', trendSortDirection: 'asc', trendXAxisScale: 'sectors',
    printTableImages: true, printTableQuantityMissing: true,
    printTableType: false, printTableVariant: false,
  };
  updateUrlParams(viewOptionsToParams(custom));
  assert.deepEqual(initialViewOptions(), custom);
});

test('sort, search and price range survive a write and read of the URL', () => {
  updateUrlParams({ order: 'Price ↓', search: 'char izard', priceMin: '3.5', priceMax: '99' });
  assert.deepEqual(initialSortConfig(), { field: 'price', direction: 'desc' });
  assert.deepEqual(initialPriceRange(), { min: 3.5, max: 99 });
  assert.equal(parseUrlParams().search, 'char izard');
});

test('a filter restores its exclusions and advanced settings, not just its checkboxes', () => {
  const custom = {
    excludedValues: ['Sword & Shield', 'Scarlet Violet'], includeMode: 'EXACT_SET',
    excludeMode: 'NOT_ALL', singleIncludeMatch: 'EXACT_SINGLE', hideZeroCount: true,
  };
  updateUrlParams({ series: ['Base'], ...filterSettingsToParams('series', custom) });
  assert.deepEqual(initialFilterSettings('series'), custom);
  assert.deepEqual(parseUrlParams().series, ['Base'], 'included values are untouched');

  updateUrlParams(filterSettingsToParams('series', FILTER_DEFAULTS));
  assert.equal(window.location.search, '?series=Base', 'clearing them clears the parameters');
});

test('each filter owns its own parameters', () => {
  updateUrlParams(filterSettingsToParams('rarity', { ...FILTER_DEFAULTS, excludedValues: ['Common'] }));
  updateUrlParams(filterSettingsToParams('artist', { ...FILTER_DEFAULTS, includeMode: 'ALL' }));
  assert.deepEqual(initialFilterSettings('rarity').excludedValues, ['Common']);
  assert.equal(initialFilterSettings('rarity').includeMode, 'ANY');
  assert.equal(initialFilterSettings('artist').includeMode, 'ALL');
  assert.deepEqual(initialFilterSettings('artist').excludedValues, []);
});

test('a corrupt or unknown parameter falls back to its default instead of breaking', () => {
  setUrl('?viewMode=banana&viewWishlist=w-1');
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'catalog' });

  setUrl('?viewMode=wishlist');
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'catalog' }, 'a wishlist with no id is not a mode');

  setUrl('?priceMin=abc&priceMax=-5');
  assert.deepEqual(initialPriceRange(), { min: null, max: null });

  setUrl('?order=Nonsense');
  assert.deepEqual(initialSortConfig(), { field: 'number', direction: 'asc' });

  setUrl('?trendXAxisScale=diagonal&formsGroupSortBy=hmm&filterByCollection=nope');
  assert.equal(initialViewOptions().trendXAxisScale, 'normal');
  assert.equal(initialPokemonGrouping().groupSortBy, 'default');
  assert.equal(initialPokemonGrouping().filterByCollection, 'all');

  setUrl('?modeSeries=WAT&xmodeSeries=NOPE&matchSeries=??&zeroSeries=maybe');
  assert.deepEqual(initialFilterSettings('series'), FILTER_DEFAULTS);
});
