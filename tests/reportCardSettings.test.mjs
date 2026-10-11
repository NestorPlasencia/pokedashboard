import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReportCardSettings, readReportCardSettings, reportAddOptions, reportCardSettingsKey, resolveReportAddTarget } from '../src/utils/reportCardSettings.ts';
import { reportFilters, reportQuery } from '../src/utils/reportFilters.ts';
import { parseUrlParams } from '../src/utils/urlParams.ts';
import { initialCollectionFilter, initialViewOptions } from '../src/utils/urlState.ts';
import { parseViewModeFromUrl } from '../src/utils/viewMode.ts';

const collections = [
  { id: 'owned', name: 'Compras', kind: 'owned', editable: true },
  { id: 'child', name: 'Compras / Shiny', kind: 'owned', editable: true, parentId: 'owned' },
  { id: 'sync', name: 'Collectr', kind: 'owned', editable: false },
  { id: 'wish', name: 'Wishlist root', kind: 'wishlist', editable: true },
];
const wishlists = [{ id: 'wish', name: 'Wishlist root', subcollections: [{ id: 'wishlist-child', name: 'Por comprar', cards: [] }] }];

test('report destinations include editable collections and wishlist subcollections, and disarm unavailable targets', () => {
  const options = reportAddOptions(collections, wishlists);
  assert.deepEqual(options.map(option => option.id), ['owned', 'child', 'wishlist-child']);
  assert.equal(resolveReportAddTarget({ kind: 'collection', id: 'sync' }, options), null);
  assert.equal(resolveReportAddTarget({ kind: 'wishlist', id: 'wish' }, options), null);
  assert.equal(resolveReportAddTarget({ kind: 'collection', id: 'deleted' }, options), null);
  assert.equal(resolveReportAddTarget({ kind: 'collection', id: 'wishlist-child' }, options), null);
  assert.equal(resolveReportAddTarget({ kind: 'wishlist', id: 'wishlist-child' }, options).label, 'Wishlist root / Por comprar');
  assert.equal(resolveReportAddTarget(null, options), null);
});

test('report add preferences are isolated by account and handle missing, malformed or inaccessible storage', () => {
  const target = { addTarget: { kind: 'collection', id: 'owned' } };
  const values = new Map([[reportCardSettingsKey('user-a'), JSON.stringify(target)]]);
  const storage = { getItem: key => values.get(key) ?? null };
  assert.deepEqual(readReportCardSettings('user-a', storage), target);
  assert.deepEqual(readReportCardSettings('user-b', storage), { addTarget: null });
  assert.deepEqual(readReportCardSettings('', storage), { addTarget: null });
  for (const raw of ['{', 'null', '{}', '[]', '{"addTarget":{"kind":"other","id":"owned"}}']) {
    assert.deepEqual(readReportCardSettings('user-a', { getItem: () => raw }), { addTarget: null });
  }
  assert.deepEqual(readReportCardSettings('user-a', { getItem() { throw new Error('denied'); } }), { addTarget: null });
  assert.deepEqual(normalizeReportCardSettings({ addTarget: { kind: 'wishlist', id: ' child ' } }), { addTarget: { kind: 'wishlist', id: 'child' } });
  assert.deepEqual(normalizeReportCardSettings({ addTarget: { kind: 'collection', id: ' ' } }), { addTarget: null });
});

test('opening a report arms only the configured destination and preserves catalog filters, Hide owned and trends', () => {
  const filters = { series: ['Sword & Shield'], rarity: ['Rare Shiny'], collections: ['Binder'], addWishlist: 'old-wishlist', addCollection: 'old-owned' };
  const options = reportAddOptions(collections, wishlists);
  const original = structuredClone(filters);
  for (const option of options) {
    const settings = normalizeReportCardSettings({ addTarget: option });
    const target = resolveReportAddTarget(settings.addTarget, options);
    const query = reportQuery(filters, 'Near Mint', ['Binder', 'Other'], target);
    const params = parseUrlParams(query);
    assert.equal(params.addCollection, option.kind === 'collection' ? option.id : undefined);
    assert.equal(params.addWishlist, option.kind === 'wishlist' ? option.id : undefined);
    assert.equal(initialCollectionFilter(params).mode, 'hideOwned');
    assert.equal(initialViewOptions(params).displayMode, 'trendUngrouped');
    assert.deepEqual(reportFilters(params), reportFilters(filters));
    const previousWindow = globalThis.window;
    try {
      globalThis.window = { location: { search: query } };
      assert.deepEqual(parseViewModeFromUrl(), { kind: 'catalog' }, 'arming does not open the destination instead of the report cards');
    } finally { globalThis.window = previousWindow; }
  }
  const off = parseUrlParams(reportQuery(filters, 'Near Mint'));
  assert.equal(off.addCollection, undefined);
  assert.equal(off.addWishlist, undefined);
  const unsafeId = 'target&viewCollectionOption=none';
  const encoded = parseUrlParams(reportQuery(filters, 'Near Mint', [], { kind: 'collection', id: unsafeId }));
  assert.equal(encoded.addCollection, unsafeId);
  assert.equal(encoded.viewCollectionOption, 'hideOwned');
  assert.deepEqual(filters, original);
});
