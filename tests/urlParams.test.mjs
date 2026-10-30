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

const { parseUrlParams, updateUrlParams, generateUrlParams, initializeFiltersFromUrl } = await import('../src/utils/urlParams.ts');
const { collectionBrowseParams, parseViewModeFromUrl, viewModeToParams } = await import('../src/utils/viewMode.ts');
const {
  initialCollectionFilter, initialPriceRange, initialSortConfig, initialViewOptions, initialPokemonGrouping,
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
    { kind: 'collection', names: ['Binder One'] },
    { kind: 'collection', names: ['Binder One', 'Deck Box'] },
  ]) {
    setUrl('');
    updateUrlParams(viewModeToParams(mode));
    assert.deepEqual(parseViewModeFromUrl(), mode, `round trip for ${mode.kind}`);
  }
});

test('switching view mode leaves nothing of the previous one behind', () => {
  updateUrlParams(viewModeToParams({ kind: 'wishlist', wishlistId: 'w-1', subcollectionId: 's-2' }));
  updateUrlParams(viewModeToParams({ kind: 'collection', names: ['Binder One'] }));
  assert.equal(window.location.search, '?viewedCollection=Binder_One&viewMode=collection');
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'collection', names: ['Binder One'] });

  updateUrlParams(viewModeToParams({ kind: 'catalog' }));
  assert.equal(window.location.search, '', 'the catalog is the default and writes nothing');
});

test('the collections filter and the viewed collection stay independent', () => {
  updateUrlParams({ collections: ['Binder One', 'Deck Box'] });
  updateUrlParams(viewModeToParams({ kind: 'collection', names: ['Deck Box'] }));
  assert.deepEqual(parseUrlParams().collections, ['Binder One', 'Deck Box']);
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'collection', names: ['Deck Box'] });
});

test('marked collections persist independently of owned filters, browsing and the add destination', () => {
  updateUrlParams({
    collections: ['Hits'], viewCollectionOption: 'hideOwned',
    markedCollections: ['Búsqueda para Maclean', 'Promos'], addCollection: 'owned-id',
  });
  assert.deepEqual(parseUrlParams().markedCollections, ['Búsqueda para Maclean', 'Promos']);
  updateUrlParams(collectionBrowseParams(['Other collection']));
  assert.deepEqual(parseUrlParams().markedCollections, ['Búsqueda para Maclean', 'Promos']);
  assert.equal(parseUrlParams().addCollection, 'owned-id');
  updateUrlParams({ markedCollections: [] });
  assert.equal(parseUrlParams().markedCollections, undefined);
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'collection', names: ['Other collection'] });
});

test('Browse removes inherited report constraints while retaining trend view and the add destination', () => {
  updateUrlParams({
    series: ['Mega Evolution'], set: ['Mega Evolution'], rarity: ['Illustration Rare'],
    variants: ['Holo', 'Normal Holo', 'Promo'], notCardVariantTopLevel: ['Parallel'],
    collections: ['Busqueda para Maclean'], viewCollectionOption: 'hideOwned',
    conditions: ['Near Mint'], priceMin: '10', priceMax: '20', search: 'Tyrunt',
    pokemonGroupingEnabled: 'true', groupByPokedex: 'true', groupByForms: 'true',
    hideNotOwnPokedex: 'true', filterByCollection: 'notOwned',
    viewMode: 'wishlist', viewWishlist: 'old-wishlist', viewSubcollection: 'old-list',
    showTrendPoints: 'true', trendSortDirection: 'desc', order: 'Price ↓',
    addCollection: 'destination-id',
  });
  updateUrlParams(collectionBrowseParams(['Busqueda para Maclean']));
  const params = parseUrlParams();
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'collection', names: ['Busqueda para Maclean'] });
  for (const key of ['series', 'set', 'rarity', 'variants', 'notCardVariantTopLevel', 'search', 'viewWishlist', 'viewSubcollection']) {
    assert.equal(params[key], undefined, key);
  }
  assert.deepEqual(initialPriceRange(params), { min: null, max: null });
  assert.deepEqual(initialCollectionFilter(params), {
    enabled: false, mode: 'none', selectedCollections: [], limit: 1, conditionsFilter: ['All'],
  });
  assert.equal(initialPokemonGrouping(params).enabled, false);
  assert.equal(initialViewOptions(params).displayMode, 'trendUngrouped');
  assert.equal(params.addCollection, 'destination-id');
  assert.equal(params.order, 'Price ↓');
});

test('a newly saved Holo card remains visible after opening a collection from an Illustration Rare report', async () => {
  const { filterCardsByProperty, applyPriceFilter, applyCollectionFilter } = await import('../src/utils/filters.ts');
  const riolu = {
    id: 'riolu-holo', name: 'Riolu', rarity: 'Rare Holo', rarities: ['Rare Holo'], variant: 'Holo',
    prices: { 'Near Mint': 8.04 },
    collections: [{ name: 'Busqueda para Maclean', quantity: { Unknown: 1 } }],
  };
  assert.deepEqual(filterCardsByProperty([riolu], 'rarities', ['Illustration Rare']), []);
  const params = collectionBrowseParams(['Busqueda para Maclean']);
  const range = initialPriceRange(params);
  const ownership = initialCollectionFilter(params);
  const basic = filterCardsByProperty([riolu], 'rarities', params.rarity ?? ['All']);
  const priced = applyPriceFilter(basic, range.min, range.max);
  const visible = applyCollectionFilter(priced, ownership.mode, ownership.selectedCollections, ownership.limit, ownership.conditionsFilter);
  assert.deepEqual(visible, [riolu], 'unknown condition and existing ownership must not hide the saved card');
});

test('defaults never appear in the URL', () => {
  assert.equal(generateUrlParams(viewOptionsToParams(initialViewOptions())), '');
  updateUrlParams({ series: ['All'], ...filterSettingsToParams('series', FILTER_DEFAULTS) });
  assert.equal(window.location.search, '');
});

test('view options survive a write and read of the URL', () => {
  const custom = {
    displayMode: 'trendUngrouped', trendSortDirection: 'asc', trendXAxisScale: 'sectors',
    binderPageColor: '#111111', binderSleeveColor: 'transparent', binderLayout: '3x3', binderStyle: 'ringed',
    printTableImages: true, printTableQuantityMissing: true,
    printTableType: false, printTableVariant: false,
  };
  updateUrlParams(viewOptionsToParams(custom));
  assert.deepEqual(initialViewOptions(), custom);
});

test('binder view and its page settings survive a URL round trip', () => {
  const binder = {
    ...initialViewOptions(),
    displayMode: 'binderUngrouped',
    binderPageColor: '#18243a',
    binderSleeveColor: '#c7d9ef',
    binderLayout: '4x4',
    binderStyle: 'ringed',
  };
  updateUrlParams(viewOptionsToParams(binder));
  assert.deepEqual(initialViewOptions(), binder);
  assert.equal(parseUrlParams().showBinder, 'true');
  assert.equal(parseUrlParams().binderStyle, 'ringed');
  updateUrlParams(viewOptionsToParams({ ...binder, displayMode: 'cardsUngrouped' }));
  assert.equal(parseUrlParams().showBinder, undefined);
});

test('the two-page binder style is the default', () => {
  assert.equal(initialViewOptions().binderStyle, 'twoPage');
  assert.equal(viewOptionsToParams(initialViewOptions()).binderStyle, undefined);
});

test('sort, search and price range survive a write and read of the URL', () => {
  updateUrlParams({ order: 'Price ↓', search: 'char izard', priceMin: '3.5', priceMax: '99' });
  assert.deepEqual(initialSortConfig(), { field: 'price', direction: 'desc' });
  assert.deepEqual(initialPriceRange(), { min: 3.5, max: 99 });
  assert.equal(parseUrlParams().search, 'char izard');
});

test('Pokédex and rarity sort survives a URL round trip', () => {
  updateUrlParams({ order: 'Pokedex and Rarity' });
  assert.equal(parseUrlParams().order, 'Pokedex and Rarity');
  assert.deepEqual(initialSortConfig(), { field: 'pokedexAndRarity', direction: 'asc' });
  setUrl('?order=Energy_and_Pokedex');
  assert.deepEqual(initialSortConfig(), { field: 'energyAndPokedex', direction: 'asc' });
});

test('evolutionary Pokédex card and group orders survive a URL round trip', () => {
  updateUrlParams({ order: 'Pokédex evolutiva', formsGroupSortBy: 'evolution' });
  assert.equal(parseUrlParams().order, 'Pokédex evolutiva');
  assert.deepEqual(initialSortConfig(), { field: 'pokedexEvolution', direction: 'asc' });
  assert.equal(initialPokemonGrouping().groupSortBy, 'evolution');
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

test('the armed edit destinations survive a write and read of the URL', () => {
  // Wanting a card and owning one are different acts, so both can be armed at once.
  updateUrlParams({ addWishlist: 'sub-1', addCollection: 'col-1' });
  assert.equal(parseUrlParams().addWishlist, 'sub-1');
  assert.equal(parseUrlParams().addCollection, 'col-1');

  updateUrlParams({ addWishlist: undefined });
  assert.equal(parseUrlParams().addWishlist, undefined, 'disarming removes the parameter');
  assert.equal(parseUrlParams().addCollection, 'col-1', 'and leaves the other one armed');

  updateUrlParams({ addCollection: undefined });
  assert.equal(window.location.search, '', 'nothing armed writes nothing');
});

test('arming is independent of viewing, so browsing a wishlist does not arm it', () => {
  updateUrlParams(viewModeToParams({ kind: 'wishlist', wishlistId: 'w-1', subcollectionId: 'sub-1' }));
  assert.equal(parseUrlParams().addWishlist, undefined);
  assert.deepEqual(parseViewModeFromUrl(), { kind: 'wishlist', wishlistId: 'w-1', subcollectionId: 'sub-1' });
});

test('every parameter written survives the round trip the filters actually use', () => {
  // Filters.tsx reads through initializeFiltersFromUrl, not parseUrlParams. Anything that
  // gets lost in there is written to the URL and silently dropped on reload.
  updateUrlParams({
    rarity: ['Rare'],
    ...filterSettingsToParams('rarity', {
      excludedValues: ['Common', 'Uncommon'],
      includeMode: 'ALL',
      excludeMode: 'NOT_ALL',
      singleIncludeMatch: 'EXACT_SINGLE',
      hideZeroCount: true,
    }),
  });

  const restored = initializeFiltersFromUrl();
  assert.deepEqual(restored.rarity, ['Rare']);
  assert.deepEqual(initialFilterSettings('rarity', restored), {
    excludedValues: ['Common', 'Uncommon'],
    includeMode: 'ALL',
    excludeMode: 'NOT_ALL',
    singleIncludeMatch: 'EXACT_SINGLE',
    hideZeroCount: true,
  });
});

test('defaults still apply to filters the URL says nothing about', () => {
  const restored = initializeFiltersFromUrl();
  assert.deepEqual(restored.series, ['All']);
  assert.deepEqual(restored.rarity, ['All']);
  assert.deepEqual(initialFilterSettings('rarity', restored).excludedValues, []);
});
