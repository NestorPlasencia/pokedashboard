import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBuying, compareBuyingAnalysis, compareBuyingPriority } from '../src/utils/reportAnalysis.ts';
import { aggregateReportHistory } from '../src/utils/reportHistory.ts';
import { readBuyingPreferences, writeBuyingPreferences } from '../src/services/buyingPreferences.ts';

const today = '2026-10-10';
const series = (prices) => prices.map((price, index) => ({ price, date: new Date(Date.parse(today) - (prices.length - index - 1) * 86400000).toISOString().slice(0, 10) }));
const curve = (prices, extra = {}) => ({ points: series(prices), covered: 10, total: 10, firstDate: null, lastDate: today, ...extra });
const valleyPrices = [...Array(170).fill(100), ...Array(20).fill(80), 78, ...Array(9).fill(80)];

test('a low stabilized basket ranks ahead of a high basket and is independent of dollar scale', () => {
  const valley = analyzeBuying(curve(valleyPrices), 365, today);
  const scaled = analyzeBuying(curve(valleyPrices.map(p => p * 500)), 365, today);
  assert.equal(valley.signal, 'valley');
  assert.ok(valley.score >= 80);
  assert.equal(scaled.score, valley.score);
  assert.equal(scaled.signal, valley.signal);
  const recent = analyzeBuying(curve(valleyPrices), 90, today);
  assert.ok(recent.score >= 80, 'choosing a shorter window does not turn mature history into a new launch');
  assert.equal(recent.historyDays, 199); assert.equal(recent.spanDays, 90);
  const high = analyzeBuying(curve([...Array(170).fill(70), ...Array(30).fill(100)]), 365, today);
  assert.equal(high.signal, 'high');
  assert.ok(compareBuyingPriority(valley, high) < 0);
});

test('a continuous decline is not a confirmed valley, and a short launch is limited', () => {
  const falling = analyzeBuying(curve(Array.from({ length: 200 }, (_, i) => 100 - i * .25)), 365, today);
  assert.equal(falling.signal, 'falling'); assert.ok(falling.score <= 59);
  const short = analyzeBuying(curve(valleyPrices.slice(-80)), 365, today);
  assert.ok(short.score <= 69);
  assert.equal(analyzeBuying(curve(valleyPrices.slice(-40)), 365, today).score, null);
});

test('incomplete, stale, empty, future and extreme data cannot produce a buy priority', () => {
  assert.equal(analyzeBuying(curve(valleyPrices, { covered: 7 }), 365, today).score, null);
  assert.equal(analyzeBuying(curve(valleyPrices, { freshCovered: 7 }), 365, today).signal, 'stale');
  assert.equal(analyzeBuying(curve([], { total: 0, covered: 0 }), 365, today).signal, 'empty');
  const aged = curve(valleyPrices); aged.points = aged.points.slice(0, -10);
  assert.equal(analyzeBuying(aged, 365, today).signal, 'stale');
  const normal = analyzeBuying(curve(valleyPrices), 365, today);
  const future = curve(valleyPrices); future.points.push({ date: '2026-10-20', price: 5000 });
  assert.deepEqual(analyzeBuying(future, 365, today), normal);
  const extreme = analyzeBuying(curve([...Array(180).fill(100), ...Array(20).fill(10)]), 365, today);
  assert.equal(extreme.signal, 'volatile'); assert.equal(extreme.score, null);
});

test('analysis window and 7/30-day changes use dates, and old minima leave the window', () => {
  const input = curve([10, ...Array(170).fill(100), ...Array(29).fill(80)]);
  const recent = analyzeBuying(input, 90, today);
  assert.equal(recent.minimum, 80);
  assert.equal(recent.change7, 0);
  assert.equal(recent.change30, -19.999999999999996);
  assert.equal(analyzeBuying(input, 365, today).minimum, 10);
  const sparse = { ...input, points: input.points.filter((_, i) => i % 10 === 0) };
  const analysis = analyzeBuying(sparse, 365, today);
  assert.equal(analysis.signal, 'stale', 'sparse old final observations are not carried to today by the analysis');
});

test('forward-filled old card prices lower freshness rather than producing a stable valley', () => {
  const history = new Map([['1:holofoil', series(valleyPrices)], ['2:holofoil', series(valleyPrices).slice(0, -20)]]);
  const cards = [{ id: 'one', productId: 1, printing: 'Holofoil' }, { id: 'two', productId: 2, printing: 'Holofoil' }];
  const aggregate = aggregateReportHistory(cards, history, today);
  assert.equal(aggregate.covered, 2);
  assert.equal(aggregate.freshCovered, 1);
  assert.equal(analyzeBuying(aggregate, 365, today).score, null);
  const sparse = aggregateReportHistory([cards[0]], new Map([['1:holofoil', [history.get('1:holofoil')[0], history.get('1:holofoil').at(-1)]]]), today);
  assert.ok(sparse.points.length > 20);
  assert.equal(analyzeBuying(sparse, 365, today).score, null, 'forward-filled days are not actual observations');
});

test('Total, Tenemos and Faltan analyze their own current basket', () => {
  const owned = { id: 'owned', productId: 1, printing: 'Holofoil' };
  const missing = { id: 'missing', productId: 2, printing: 'Holofoil' };
  const history = new Map([
    ['1:holofoil', series([...Array(170).fill(70), ...Array(30).fill(100)])],
    ['2:holofoil', series(valleyPrices)],
  ]);
  const analyses = [[owned, missing], [owned], [missing]].map(cards => analyzeBuying(aggregateReportHistory(cards, history, today), 365, today));
  assert.deepEqual(analyses.map(a => a.current), [180, 100, 80]);
  assert.equal(analyses[1].signal, 'high');
  assert.equal(analyses[2].signal, 'valley');
  assert.notEqual(analyses[0].score, analyses[1].score);
  assert.notEqual(analyses[0].score, analyses[2].score);
});

test('signal ordering groups Spanish labels in both directions and retains priority within a signal', () => {
  const base = analyzeBuying(curve(valleyPrices), 365, today);
  const entries = [
    { ...base, signal: 'high', score: 20 },
    { ...base, signal: 'valley', score: 80 },
    { ...base, signal: 'falling', score: 59 },
    { ...base, signal: 'middle', score: 50 },
    { ...base, signal: 'empty', score: null },
    { ...base, signal: 'valley', score: 90 },
    { ...base, signal: 'near-low', score: 70 },
  ];
  const sort = order => [...entries].sort((a, b) => compareBuyingAnalysis(a, b, order));
  assert.deepEqual(sort('signal-asc'), [entries[6], entries[2], entries[4], entries[5], entries[1], entries[0], entries[3]]);
  assert.deepEqual(sort('signal-desc'), [entries[3], entries[0], entries[5], entries[1], entries[4], entries[2], entries[6]]);
  assert.deepEqual(sort('priority').map(a => a.score), [90, 80, 70, 59, 50, 20, null]);
  assert.deepEqual(sort('saved'), entries);
});

test('automatic analysis defaults and preferences are persistent, validated and account-specific', () => {
  const previous = globalThis.window, storage = new Map();
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  try {
    const defaults = readBuyingPreferences('one');
    assert.deepEqual(defaults, { enabled: true, scope: 'all', group: 'missing', days: 365, order: 'priority' });
    assert.equal(readBuyingPreferences('').group, 'total');
    writeBuyingPreferences('one', { ...defaults, days: 180, scope: 'selected', enabled: false, order: 'signal-asc' });
    assert.equal(readBuyingPreferences('one').days, 180);
    assert.equal(readBuyingPreferences('one').enabled, false);
    assert.equal(readBuyingPreferences('one').order, 'signal-asc');
    writeBuyingPreferences('one', { ...defaults, order: 'signal-desc' });
    assert.equal(readBuyingPreferences('one').order, 'signal-desc');
    assert.equal(readBuyingPreferences('two').days, 365);
    storage.set('pokedashboard:buying-analysis:v1:two', '{bad');
    assert.equal(readBuyingPreferences('two').enabled, true);
    storage.set('pokedashboard:buying-analysis:v1:two', JSON.stringify({ days: -90, group: 'invalid' }));
    assert.equal(readBuyingPreferences('two').days, 365);
    assert.equal(readBuyingPreferences('two').group, 'missing');
  } finally { globalThis.window = previous; }
});
