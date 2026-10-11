import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSuggestedPrice, DEFAULT_SUGGESTED_PRICE_SETTINGS as defaults, formatSuggestedPrice, normalizeSuggestedPriceSettings, readSuggestedPriceSettings, SUGGESTED_PRICE_STORAGE_KEY } from '../src/utils/suggestedPrice.ts';

test('target prices use six requested discount tiers, including their boundary values', () => {
  for (const [market, expected] of [[4.56, 4], [4.99, 4], [5, 4], [9.99, 8], [10, 9], [19.99, 17], [20, 15], [49.99, 40], [50, 45], [99.99, 85], [100, 90], [200, 170]]) {
    assert.equal(calculateSuggestedPrice(market, defaults).price, expected, `market ${market}`);
  }
});

test('screen and print targets stay deterministic, round and at least 10% below market', () => {
  for (let cents = 150; cents < 100000; cents += 73) {
    const market = cents / 100;
    const target = calculateSuggestedPrice(market, defaults);
    assert.deepEqual(target, calculateSuggestedPrice(market, defaults));
    assert.ok(target.price > 0);
    assert.ok(target.price <= market * .90 + 1e-9);
    const step = market >= 100 ? 10 : market >= 20 ? 5 : 1;
    assert.equal(target.price % step, 0);
  }
});

test('when no multiple fits the band, the next lower round price keeps the minimum discount', () => {
  assert.deepEqual(calculateSuggestedPrice(5, defaults), { price: 4, percent: 20 });
  assert.deepEqual(calculateSuggestedPrice(21, defaults), { price: 15, percent: 29 });
  assert.equal(calculateSuggestedPrice(.5, defaults), null);
  assert.equal(calculateSuggestedPrice(.01, defaults), null);
});

test('custom discount bands and rounding affect each price tier independently', () => {
  const custom = normalizeSuggestedPriceSettings({
    minimumDiscountPercent: 10,
    tiers: { under50: { maximumDiscountPercent: 10, roundingStep: .01 } },
  });
  assert.deepEqual(calculateSuggestedPrice(40, custom), { price: 36, percent: 10 });
  assert.deepEqual(calculateSuggestedPrice(45.56, custom), { price: 41, percent: 10 });
  assert.equal(custom.tiers.under5.roundingStep, 1);
  assert.equal(custom.tiers.from100.roundingStep, 10);
  const differentRounding = normalizeSuggestedPriceSettings({ tiers: { from100: { maximumDiscountPercent: 20, roundingStep: .01 } } });
  assert.equal(calculateSuggestedPrice(200, differentRounding).price, 170);
});

test('fractional prices only appear when a decimal rounding step is explicitly configured', () => {
  const settings = normalizeSuggestedPriceSettings({ minimumDiscountPercent: 10, tiers: { under5: { maximumDiscountPercent: 10, roundingStep: .01 } } });
  assert.deepEqual(calculateSuggestedPrice(4.56, settings), { price: 4.1, percent: 10 });
  assert.deepEqual(calculateSuggestedPrice(.02, settings), { price: .01, percent: 50 });
});

test('round targets display without decimal zeros in both cards and print', () => {
  assert.equal(formatSuggestedPrice(3), '$3');
  assert.equal(formatSuggestedPrice(120), '$120');
  assert.equal(formatSuggestedPrice(4.1), '$4.1');
});

test('missing, zero, negative or non-finite market prices have no suggested price', () => {
  for (const market of [null, undefined, 0, -2, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    assert.equal(calculateSuggestedPrice(market, defaults), null);
  }
});

test('settings survive storage round trips with separate card and print visibility', () => {
  const settings = normalizeSuggestedPriceSettings({ showOnCards: false, showInWishlistPrint: true, minimumDiscountPercent: 10 });
  const storage = { getItem(key) { assert.equal(key, SUGGESTED_PRICE_STORAGE_KEY); return JSON.stringify(settings); } };
  assert.deepEqual(readSuggestedPriceSettings(storage), settings);
  assert.deepEqual(readSuggestedPriceSettings({ getItem: () => null }), defaults);
});

test('malformed or inaccessible storage and invalid numeric settings fall back safely', () => {
  for (const raw of ['{', 'null', '[]', '"bad"']) {
    assert.deepEqual(readSuggestedPriceSettings({ getItem: () => raw }), defaults);
  }
  assert.deepEqual(readSuggestedPriceSettings({ getItem() { throw new Error('denied'); } }), defaults);
  const invalid = normalizeSuggestedPriceSettings({ minimumDiscountPercent: Infinity, tiers: { under5: { maximumDiscountPercent: -1, roundingStep: 0 } } });
  assert.deepEqual(invalid, defaults);
  const reversed = normalizeSuggestedPriceSettings({ minimumDiscountPercent: 50 });
  assert.equal(reversed.tiers.from100.maximumDiscountPercent, 50);
});

test('each exact boundary chooses the new tier without gaps or overlap', () => {
  const settings = normalizeSuggestedPriceSettings({ minimumDiscountPercent: 0, tiers: {
    under5: { maximumDiscountPercent: 10, roundingStep: .01 },
    under10: { maximumDiscountPercent: 20, roundingStep: .01 },
    under20: { maximumDiscountPercent: 30, roundingStep: .01 },
    under50: { maximumDiscountPercent: 40, roundingStep: .01 },
    under100: { maximumDiscountPercent: 50, roundingStep: .01 },
    from100: { maximumDiscountPercent: 60, roundingStep: .01 },
  } });
  for (const [market, expected] of [[4, 3.8], [5, 4.5], [10, 8.5], [20, 16], [50, 37.5], [100, 70]]) {
    assert.equal(calculateSuggestedPrice(market, settings).price, expected);
  }
});

test('legacy three-tier preferences adopt the new percentages and preserve visibility and rounding', () => {
  const legacy = { showOnCards: false, showInWishlistPrint: false, minimumDiscountPercent: 15, tiers: {
    low: { maximumDiscountPercent: 30, roundingStep: 1 },
    middle: { maximumDiscountPercent: 25, roundingStep: 5 },
    high: { maximumDiscountPercent: 20, roundingStep: 10 },
  } };
  const migrated = readSuggestedPriceSettings({ getItem: key => key.endsWith(':v1') ? JSON.stringify(legacy) : null });
  assert.deepEqual(migrated, { ...defaults, showOnCards: false, showInWishlistPrint: false });
  const customRounding = normalizeSuggestedPriceSettings({ ...legacy, tiers: { ...legacy.tiers, low: { roundingStep: .5 } } });
  assert.equal(customRounding.tiers.under5.roundingStep, .5);
  assert.equal(customRounding.tiers.under10.roundingStep, .5);
  assert.equal(customRounding.tiers.under20.roundingStep, .5);
});

test('new saved percentages take precedence over legacy preferences', () => {
  const customized = normalizeSuggestedPriceSettings({ minimumDiscountPercent: 12, tiers: { under5: { maximumDiscountPercent: 16, roundingStep: 1 } } });
  assert.deepEqual(readSuggestedPriceSettings({ getItem: key => key === SUGGESTED_PRICE_STORAGE_KEY ? JSON.stringify(customized) : '{}' }), customized);
});
