import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterReportCards, partitionReportCards, reportValue, reportFilters, reportQuery } from '../src/utils/reportFilters.ts';
import { aggregateReportHistory, indexReportHistory } from '../src/utils/reportHistory.ts';
import { assignReportGroup, groupReportList, orderSelectedReports, parseReports, planReportsBy, readReports, reportBaseFilters, reportCollectionNames, writeReports } from '../src/services/reports.ts';
import { parseUrlParams } from '../src/utils/urlParams.ts';
import { initialCollectionFilter, initialViewOptions } from '../src/utils/urlState.ts';
import { applyCollectionFilter } from '../src/utils/filters.ts';
import { loadReportHistory } from '../src/services/reportHistory.ts';

const card = (id, extra = {}) => ({ id: String(id), productId: id, name: 'Pikachu', setName: 'Shining Fates', setNames: ['Shining Fates'], setSeries: 'Sword & Shield', setSeriesNames: ['Sword & Shield'], variant: 'Normal Holo', printing: 'Holofoil', cardVariantTopLevel: 'Standard', rarities: ['Rare Shiny'], cardType: 'Pokémon', types: ['Lightning'], subtypes: [], number: '001', prices: { 'Near Mint': 10 }, collections: [], ...extra });

test('a saved filter matches card metadata, includes multi-set aliases, and excludes Parallel', () => {
  const normal = card(1);
  const parallel = card(2, { cardVariantTopLevel: 'Parallel' });
  const trainer = card(3, { cardType: 'Trainer', rarities: ['Rare Ultra'] });
  const filters = { series: ['Sword & Shield'], rarity: ['Rare Shiny'], type: ['Pokémon'], notCardVariantTopLevel: ['Parallel'] };
  assert.deepEqual(filterReportCards([normal, normal, parallel, trainer], filters, 'Near Mint').map(card => card.id), ['1']);
  assert.equal(filterReportCards([normal], { set: ['Shining Fates'], search: '001', priceMax: '10' }, 'Near Mint').length, 1);
  assert.equal(filterReportCards([normal], { priceMin: '11' }, 'Near Mint').length, 0);
  assert.equal(filterReportCards([card(4, { nationalPokedexNumbers: [25] })], { pokedexRegion: ['Kanto'] }, 'Near Mint').length, 1);
});

test('total partitions into owned and missing using active copies, descendants, and unknown conditions', () => {
  const cards = [card(1, { collections: [{ name: 'Child', quantity: { Unknown: 3 } }] }), card(2), card(3, { collections: [{ name: 'Other', quantity: { 'Near Mint': 1 } }] })];
  const collections = [{ id: 'parent', name: 'Binder', parentId: null }, { id: 'child', name: 'Child', parentId: 'parent' }];
  const result = partitionReportCards(cards, ['Binder', 'Child'], collections);
  assert.equal(result.total.length, 3);
  assert.deepEqual(result.owned.map(card => card.id), ['1']);
  assert.deepEqual(result.missing.map(card => card.id), ['2', '3']);
  assert.equal(reportValue(result.owned, 'Near Mint').value, 10, 'duplicates do not multiply group value');
  assert.equal(partitionReportCards(cards, [], collections).owned.length, 2);
});

test('common collections apply the same ownership scope to every report, including catalog links', () => {
  const cards = [card(1, { collections: [{ name: 'Child', quantity: { Unknown: 3 } }] }),
    card(2, { prices: { 'Near Mint': 20 }, collections: [{ name: 'Other', quantity: { 'Near Mint': 1 } }] }),
    card(3, { prices: { 'Near Mint': 30 } })];
  const collections = [{ id: 'parent', name: 'Binder', parentId: null }, { id: 'child', name: 'Child', parentId: 'parent' }];
  const reports = ['Other', 'Binder'].map((name, index) => ({ id: String(index), name, condition: 'Near Mint', filters: { series: ['Sword & Shield'], collections: [name] } }));
  const original = structuredClone(reports);
  const state = { reports, selectedIds: [], ownershipCollections: ['Binder'] };
  for (const report of reports) {
    const names = reportCollectionNames(report, state);
    const groups = partitionReportCards(filterReportCards(cards, report.filters, report.condition), names, collections);
    assert.deepEqual(groups.owned.map(card => card.id), ['1']);
    assert.deepEqual(groups.missing.map(card => card.id), ['2', '3']);
    assert.equal(reportValue(groups.owned, report.condition).value, 10);
    assert.equal(reportValue(groups.missing, report.condition).value, 50);
    assert.equal(reportValue(groups.total, report.condition).value, 60);
    const link = parseUrlParams(reportQuery({ ...report.filters, collections: names }, report.condition));
    assert.deepEqual(link.collections, ['Binder']);
    assert.equal(initialCollectionFilter(link).mode, 'hideOwned');
    assert.equal(initialViewOptions(link).displayMode, 'trendUngrouped');
    assert.deepEqual(applyCollectionFilter(cards, 'hideOwned', ['Binder', 'Child']).map(card => card.id), ['2', '3']);
    assert.deepEqual(link.conditions, ['Near Mint']);
    const all = partitionReportCards(cards, reportCollectionNames(report, { ...state, ownershipCollections: [] }), collections);
    assert.deepEqual(all.owned.map(card => card.id), ['1', '2'], 'empty common scope means all inventory, not the old report scope');
    const allParams = parseUrlParams(reportQuery({ ...report.filters, collections: [] }, report.condition, ['Binder', 'Child', 'Other']));
    const allFilter = initialCollectionFilter(allParams);
    assert.equal(allFilter.enabled, true);
    assert.equal(allFilter.mode, 'hideOwned');
    assert.equal(initialViewOptions(allParams).displayMode, 'trendUngrouped');
    assert.deepEqual(applyCollectionFilter(cards, allFilter.mode, allFilter.selectedCollections).map(card => card.id), ['3']);
    assert.deepEqual(reportCollectionNames(report, { reports, selectedIds: [] }), report.filters.collections);
  }
  assert.deepEqual(reports, original, 'common settings preserve each report for switching back');
});

test('common collection settings survive backups and stay separate per account, while old backups remain valid', () => {
  const previous = globalThis.window, storage = new Map();
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  try {
    const report = { id: 'one', name: 'Mini Shiny', condition: 'Near Mint', filters: { series: ['Sword & Shield'], collections: ['Legacy'] } };
    const state = { reports: [report], selectedIds: ['one'], ownershipCollections: [' Hits ', 'Binder', 'Hits'] };
    const parsed = parseReports(JSON.parse(JSON.stringify(state)));
    assert.deepEqual(parsed.ownershipCollections, ['Hits', 'Binder']);
    writeReports('one', parsed);
    assert.deepEqual(readReports('one'), parsed);
    assert.deepEqual(readReports('two').ownershipCollections, []);
    writeReports('one', { ...parsed, ownershipCollections: [] });
    assert.deepEqual(readReports('one').ownershipCollections, []);
    const legacy = { reports: [report], selectedIds: ['one'] };
    assert.deepEqual(parseReports(legacy), legacy);
    for (const ownershipCollections of [null, 'Hits', [4], [' ']]) {
      assert.throws(() => parseReports({ ...legacy, ownershipCollections }), /colecciones comunes/);
    }
  } finally { globalThis.window = previous; }
});

test('missing market prices remain missing, while a real zero price counts', () => {
  assert.deepEqual(reportValue([card(1), card(2, { prices: {} }), card(3, { prices: { 'Near Mint': 0 } })], 'Near Mint'), { value: 10, unpriced: 1 });
});

test('importing a catalog URL retains group filters and removes ownership/display/edit state', () => {
  const input = parseUrlParams('?series=Sword_and_Shield&rarity=Rare_Shiny&collections=Hits|Binder&notCardVariantTopLevel=Parallel&viewCollectionOption=hideOwned&addCollection=private-id&formsAllowVariants=Default');
  const filters = reportFilters(input);
  assert.deepEqual(filters, { series: ['Sword & Shield'], rarity: ['Rare Shiny'], notCardVariantTopLevel: ['Parallel'], collections: ['Hits', 'Binder'] });
  assert.deepEqual(reportFilters(parseUrlParams(reportQuery(filters, 'Near Mint'))), filters);
  const special = { series: ['Sword & Shield'], search: 'Mr. Mime #1 & Friends' };
  assert.deepEqual(reportFilters(parseUrlParams(reportQuery(special, 'Near Mint'))), special);
});

const historyRow = (date, price, extra = {}) => ({ productId: 1, date, marketPrice: price, printing: 'Holofoil', condition: 'Near Mint', bucketDays: 1, source: 'price_history', ...extra });
test('daily history chooses finest buckets and exact printing/condition, independent of response order', () => {
  const rows = [historyRow('2026-01-01', 10), historyRow('2026-01-01', 40, { bucketDays: 7 }), historyRow('2026-01-01', 8, { condition: 'Lightly Played' }), historyRow('2026-01-01', 100, { printing: 'Reverse Holofoil' }), historyRow('2026-01-02', null)];
  assert.deepEqual(indexReportHistory(rows, 'Near Mint').get('1:holofoil'), [{ date: '2026-01-01', price: 10 }]);
  assert.deepEqual(indexReportHistory([...rows].reverse(), 'Near Mint').get('1:holofoil'), [{ date: '2026-01-01', price: 10 }]);
});

test('aggregate starts at common coverage, fills gaps forward, counts variants, and reports missing histories', () => {
  const history = indexReportHistory([historyRow('2026-01-01', 10), historyRow('2026-01-03', 12), historyRow('2026-01-02', 5, { productId: 2 }), historyRow('2026-01-04', 6, { productId: 2 }), historyRow('2026-01-02', 20, { printing: 'Reverse Holofoil' })], 'Near Mint');
  const result = aggregateReportHistory([card(1), card(1), card(2), card(3), card(4, { productId: 1, printing: 'Reverse Holofoil' })], history);
  assert.equal(result.covered, 3);
  assert.equal(result.total, 4);
  assert.deepEqual(result.points, [{ date: '2026-01-02', price: 35 }, { date: '2026-01-03', price: 37 }, { date: '2026-01-04', price: 38 }]);
  assert.deepEqual(aggregateReportHistory([], history).points, []);
  assert.equal(aggregateReportHistory([card(5, { printing: undefined })], history).covered, 0, 'unknown printing never borrows another variant price');
});

test('report configurations stay separate per account and only reference saved comparisons', () => {
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  const report = { id: 'one', name: 'Mini Shiny', filters: { series: ['Sword & Shield'], rarity: ['Rare Shiny'] }, condition: 'Near Mint' };
  writeReports('user-one', { reports: [report], selectedIds: ['one', 'missing', 'one'] });
  assert.deepEqual(readReports('user-one'), { reports: [report], selectedIds: ['one'] });
  assert.deepEqual(readReports('user-two').reports, []);
  assert.deepEqual(readReports('').reports, []);
  assert.throws(() => parseReports({ reports: [{ ...report, filters: {} }] }), /serie/);
  assert.throws(() => parseReports({ reports: [report, report] }), /duplicados/);
  assert.throws(() => parseReports({ reports: [{ ...report, filters: { ...report.filters, priceMin: 'abc' } }] }), /rango/);
});

test('batch set reports retain shared filters, replace the set and omit equivalent saved reports', () => {
  const template = { id: 'paldea', name: 'Paldea Evolved', condition: 'Near Mint', filters: {
    series: ['Scarlet & Violet'], set: ['Paldea Evolved'], notSet: ['Obsidian Flames'],
    cardVariantTopLevel: ['Standard'], notRarity: ['Common', 'Uncommon', 'Rare'], collections: ['Hyatt', 'Hits'], priceMin: '1'
  } };
  const before = structuredClone(template);
  const equivalent = { ...template, id: 'existing', name: 'Custom name', filters: {
    ...template.filters, set: ['Paradox Rift'], notSet: [], collections: ['Hits', 'Hyatt'], notRarity: ['Rare', 'Common', 'Uncommon']
  } };
  const plans = planReportsBy(template, 'set', ['Paradox Rift', 'Obsidian Flames', 'Paradox Rift', '', 'All'], [equivalent], ' Hits ');
  assert.equal(plans.length, 2);
  assert.equal(plans[0].existingId, 'existing');
  assert.equal(plans[1].existingId, undefined);
  assert.equal(plans[1].name, 'Hits · Obsidian Flames');
  assert.deepEqual(plans[1].filters, { series: ['Scarlet & Violet'], set: ['Obsidian Flames'], cardVariantTopLevel: ['Standard'],
    notRarity: ['Common', 'Uncommon', 'Rare'], collections: ['Hyatt', 'Hits'], priceMin: '1' });
  assert.deepEqual(template, before, 'using a report as a template does not modify it');
  assert.equal(planReportsBy(template, 'set', ['Paradox Rift'], [{ ...equivalent, condition: 'Lightly Played' }])[0].existingId, undefined);
  assert.equal(planReportsBy(template, 'set', ['Paradox Rift'], [{ ...equivalent, filters: { ...equivalent.filters, collections: ['Hits'] } }])[0].existingId, undefined,
    'different collections are a distinct report');
  assert.equal(parseReports({ reports: plans.map((plan, index) => ({ ...plan, id: `new-${index}` })) }).reports.length, 2);
});

test('batch rarity reports replace rarity exclusions while preserving type, subtype and set filters', () => {
  const template = { id: 'one', name: 'Ultra Rare Pokémon', condition: 'Near Mint', filters: {
    series: ['Sword & Shield'], rarity: ['Rare Ultra'], notRarity: ['Rare Secret'], type: ['Pokémon'], subtypes: ['VSTAR'],
    notSet: ['Celebrations'], notCardVariantTopLevel: ['Jumbo'], collections: ['Hits']
  } };
  const plans = planReportsBy(template, 'rarity', ['Rare Rainbow', 'Rare Secret'], []);
  assert.deepEqual(reportBaseFilters(template.filters, 'rarity'), { series: ['Sword & Shield'], type: ['Pokémon'], subtypes: ['VSTAR'],
    notSet: ['Celebrations'], notCardVariantTopLevel: ['Jumbo'], collections: ['Hits'] });
  assert.deepEqual(plans.map(plan => plan.name), ['Rare Rainbow', 'Rare Secret']);
  assert.deepEqual(plans[1].filters.rarity, ['Rare Secret']);
  assert.equal(plans[1].filters.notRarity, undefined);
  assert.deepEqual(plans[1].filters.collections, ['Hits']);
  assert.deepEqual(planReportsBy(template, 'rarity', [], []), []);
});

test('report list groups sets apart from rarities, respects custom groups, and preserves report order', () => {
  const report = (id, filters, group) => ({ id, name: id, condition: 'Near Mint', filters, ...(group ? { group } : {}) });
  const reports = [report('paldea', { series: ['Scarlet & Violet'], set: ['Paldea Evolved'] }),
    report('shiny', { series: ['Scarlet & Violet'], rarity: ['Shiny Rare'] }),
    report('rift', { series: ['Scarlet & Violet'], set: ['Paradox Rift'] }),
    report('ultra', { series: ['Sword & Shield'], rarity: ['Rare Ultra'] }, 'Mis favoritas')];
  const before = structuredClone(reports);
  const sections = groupReportList(reports);
  assert.deepEqual(sections.map(section => section.name), ['Sets · Scarlet & Violet', 'Rarezas · Scarlet & Violet', 'Mis favoritas']);
  assert.deepEqual(sections[0].reports.map(report => report.id), ['paldea', 'rift']);
  assert.equal(groupReportList(reports, 'series').length, 2);
  assert.deepEqual(groupReportList(reports, 'custom').map(section => section.name), ['Sin grupo', 'Mis favoritas']);
  assert.deepEqual(groupReportList(reports, 'none')[0].reports, reports);
  assert.deepEqual(reports, before);
  const mixed = [report('one', { series: ['B', 'A'], set: ['Set 1'] }), report('two', { series: ['A', 'B'], set: ['Set 2'] })];
  assert.equal(groupReportList(mixed, 'series').length, 1, 'series order does not split equivalent groups');
  assert.deepEqual(groupReportList([]), []);
});

test('moving reports to a group preserves filters and selections, saves metadata and supports old backups', () => {
  const report = { id: 'one', name: 'Paldea', condition: 'Near Mint', filters: { series: ['Scarlet & Violet'], set: ['Paldea Evolved'], collections: ['Hits'] } };
  const original = { reports: [report, { ...report, id: 'two', name: 'Other' }], selectedIds: ['one'], grouping: 'series' };
  const assigned = assignReportGroup(original, ['one', 'unknown'], '  Sets favoritos  ');
  assert.equal(assigned.reports[0].group, 'Sets favoritos');
  assert.equal(assigned.reports[1].group, undefined);
  assert.equal(original.reports[0].group, undefined);
  assert.deepEqual(assigned.selectedIds, ['one']);
  assert.deepEqual(assigned.reports[0].filters, report.filters);
  assert.equal(parseReports(JSON.parse(JSON.stringify(assigned))).grouping, 'series');
  assert.equal(parseReports(JSON.parse(JSON.stringify(assigned))).reports[0].group, 'Sets favoritos');
  assert.equal(planReportsBy(assigned.reports[0], 'set', ['Paradox Rift'], [])[0].group, 'Sets favoritos');
  assert.equal(assignReportGroup(assigned, ['one'], '').reports[0].group, undefined);
  assert.deepEqual(parseReports({ reports: [report], selectedIds: ['one'] }), { reports: [report], selectedIds: ['one'] });
  assert.throws(() => parseReports({ reports: [report], grouping: 'invalid' }), /agrupación/);
  assert.throws(() => parseReports({ reports: [{ ...report, group: 3 }] }), /grupo/);
});

test('ordering only moves selected reports and preserves unselected slots, groups and saved data', () => {
  const reports = [
    { id: 'low', score: 20, filters: { series: ['A'] } },
    { id: 'untouched', score: 100, filters: { series: ['A'] } },
    { id: 'high', score: 90, filters: { series: ['A'] } },
    { id: 'other-group', score: 95, filters: { series: ['B'] } },
  ];
  const before = structuredClone(reports);
  const selection = ['low', 'high'];
  const sort = items => orderSelectedReports(items, selection, report => report.id, (a, b) => b.score - a.score);
  assert.deepEqual(sort(reports).map(report => report.id), ['high', 'untouched', 'low', 'other-group']);
  assert.equal(sort(reports)[1], reports[1]);
  assert.equal(sort(reports)[3], reports[3]);
  assert.deepEqual(reports, before);
  const sections = groupReportList(reports, 'series').map(section => ({ ...section, reports: sort(section.reports) }));
  assert.deepEqual(sections.map(section => section.name), ['A', 'B']);
  assert.deepEqual(sections[0].reports.map(report => report.id), ['high', 'untouched', 'low']);
  assert.deepEqual(orderSelectedReports(reports, [], r => r.id, (a, b) => b.score - a.score), reports);
  assert.deepEqual(orderSelectedReports(reports, ['low'], r => r.id, (a, b) => b.score - a.score), reports);
});

test('history batches deduplicate IDs, check cancellation and reject truncated data', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      return { ok: true, json: async () => ({ points: body.ids.map(productId => ({ productId, total: 1, data: [historyRow('2026-01-01', 10)] })) }) };
    };
    const result = await loadReportHistory([...Array.from({ length: 41 }, (_, index) => 1000 + index), 1000], 'Near Mint', new AbortController().signal);
    assert.equal(calls.length, 2); assert.equal(calls[0].ids.length, 40); assert.equal(calls[1].ids.length, 1); assert.equal(result.length, 41);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ points: [{ productId: 9000, total: 2, data: [historyRow('2026-01-01', 10)] }] }) });
    await assert.rejects(loadReportHistory([9000], 'Near Mint', new AbortController().signal), /incompleto/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loadReportHistory([9001], 'Near Mint', controller.signal), { name: 'AbortError' });
  } finally { globalThis.fetch = originalFetch; }
});
