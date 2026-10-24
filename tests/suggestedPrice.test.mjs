import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSuggestedPrice, DEFAULT_SUGGESTED_PRICE_SETTINGS as defaults, formatSuggestedPrice, normalizeSuggestedPriceSettings, readSuggestedPriceSettings, SUGGESTED_PRICE_STORAGE_KEY, SUGGESTED_PRICE_TIERS } from '../src/utils/suggestedPrice.ts';

test('target prices use six requested discount tiers, including their boundary values', () => {
  for (const [market, expected] of [[2.21, 2], [4.56, 4], [4.99, 4.5], [5, 4.5], [9.99, 8.5], [10, 9], [19.99, 17], [20, 18], [49.99, 42], [50, 42], [99.99, 84], [100, 90], [200, 170]]) {
    assert.equal(calculateSuggestedPrice(market, defaults).price, expected, `market ${market}`);
  }
});

test('screen and print targets respect each range minimum and rounding deterministically', () => {
  for (let cents = 150; cents < 100000; cents += 73) {
    const market = cents / 100;
    const target = calculateSuggestedPrice(market, defaults);
    assert.deepEqual(target, calculateSuggestedPrice(market, defaults));
    assert.ok(target.price > 0);
    const range = SUGGESTED_PRICE_TIERS.find(({ minimum, maximum }) => market >= minimum && (maximum === null || market < maximum));
    const tier = defaults.tiers[range.id];
    assert.ok(target.price <= market * (1 - tier.minimumDiscountPercent / 100) + 1e-9);
    assert.equal(Math.round(target.price * 100) % Math.round(tier.roundingStep * 100), 0);
  }
});

test('when no multiple fits the band, the next lower round price keeps the minimum discount', () => {
  assert.deepEqual(calculateSuggestedPrice(1, defaults), { price: .5, percent: 50 });
  assert.deepEqual(calculateSuggestedPrice(23, defaults), { price: 18, percent: 22 });
  assert.equal(calculateSuggestedPrice(.5, defaults), null);
  assert.equal(calculateSuggestedPrice(.01, defaults), null);
});

test('custom discount bands and rounding affect each price tier independently', () => {
  const custom = normalizeSuggestedPriceSettings({
    tiers: { under50: { minimumDiscountPercent: 10, maximumDiscountPercent: 10, roundingStep: .01 } },
  });
  assert.deepEqual(calculateSuggestedPrice(40, custom), { price: 36, percent: 10 });
  assert.deepEqual(calculateSuggestedPrice(45.56, custom), { price: 41, percent: 10 });
  assert.equal(custom.tiers.under5.roundingStep, .5);
  assert.equal(custom.tiers.under5.minimumDiscountPercent, 5);
  assert.equal(custom.tiers.from100.roundingStep, 10);
  const differentRounding = normalizeSuggestedPriceSettings({ tiers: { from100: { maximumDiscountPercent: 20, roundingStep: .01 } } });
  assert.equal(calculateSuggestedPrice(200, differentRounding).price, 170);
  const higherMinimum = normalizeSuggestedPriceSettings({ tiers: { under5: { minimumDiscountPercent: 10 } } });
  assert.deepEqual(calculateSuggestedPrice(2.21, higherMinimum), { price: 1.5, percent: 32 });
  assert.deepEqual(calculateSuggestedPrice(8, higherMinimum), calculateSuggestedPrice(8, defaults));
});

test('fractional prices only appear when a decimal rounding step is explicitly configured', () => {
  const settings = normalizeSuggestedPriceSettings({ tiers: { under5: { minimumDiscountPercent: 10, maximumDiscountPercent: 10, roundingStep: .01 } } });
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
  const settings = normalizeSuggestedPriceSettings({ showOnCards: false, showInWishlistPrint: true, tiers: { under5: { minimumDiscountPercent: 6, maximumDiscountPercent: 12, roundingStep: .25 } } });
  const storage = { getItem(key) { assert.equal(key, SUGGESTED_PRICE_STORAGE_KEY); return JSON.stringify(settings); } };
  assert.deepEqual(readSuggestedPriceSettings(storage), settings);
  assert.deepEqual(readSuggestedPriceSettings({ getItem: () => null }), defaults);
});

test('malformed or inaccessible storage and invalid numeric settings fall back safely', () => {
  for (const raw of ['{', 'null', '[]', '"bad"']) {
    assert.deepEqual(readSuggestedPriceSettings({ getItem: () => raw }), defaults);
  }
  assert.deepEqual(readSuggestedPriceSettings({ getItem() { throw new Error('denied'); } }), defaults);
  const invalid = normalizeSuggestedPriceSettings({ tiers: { under5: { minimumDiscountPercent: Infinity, maximumDiscountPercent: -1, roundingStep: 0 } } });
  assert.deepEqual(invalid, defaults);
  const reversed = normalizeSuggestedPriceSettings({ tiers: { from100: { minimumDiscountPercent: 50 } } });
  assert.equal(reversed.tiers.from100.maximumDiscountPercent, 50);
});

test('each exact boundary chooses the new tier without gaps or overlap', () => {
  const settings = normalizeSuggestedPriceSettings({ tiers: {
    under5: { minimumDiscountPercent: 0, maximumDiscountPercent: 10, roundingStep: .01 },
    under10: { minimumDiscountPercent: 0, maximumDiscountPercent: 20, roundingStep: .01 },
    under20: { minimumDiscountPercent: 0, maximumDiscountPercent: 30, roundingStep: .01 },
    under50: { minimumDiscountPercent: 0, maximumDiscountPercent: 40, roundingStep: .01 },
    under100: { minimumDiscountPercent: 0, maximumDiscountPercent: 50, roundingStep: .01 },
    from100: { minimumDiscountPercent: 0, maximumDiscountPercent: 60, roundingStep: .01 },
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
  const customized = normalizeSuggestedPriceSettings({ tiers: { under5: { minimumDiscountPercent: 12, maximumDiscountPercent: 16, roundingStep: 1 } } });
  assert.deepEqual(readSuggestedPriceSettings({ getItem: key => key === SUGGESTED_PRICE_STORAGE_KEY ? JSON.stringify(customized) : '{}' }), customized);
});

const previousDefaults = {
  showOnCards: true, showInWishlistPrint: true, minimumDiscountPercent: 10,
  tiers: {
    under5: { maximumDiscountPercent: 15, roundingStep: 1 },
    under10: { maximumDiscountPercent: 18, roundingStep: 1 },
    under20: { maximumDiscountPercent: 20, roundingStep: 1 },
    under50: { maximumDiscountPercent: 25, roundingStep: 5 },
    under100: { maximumDiscountPercent: 20, roundingStep: 5 },
    from100: { maximumDiscountPercent: 18, roundingStep: 10 },
  },
};

test('saved v2 defaults upgrade automatically to the requested per-range values', () => {
  const migrated = readSuggestedPriceSettings({ getItem: key => key.endsWith(':v2') ? JSON.stringify(previousDefaults) : null });
  assert.deepEqual(migrated, defaults);
  assert.deepEqual(calculateSuggestedPrice(2.21, migrated), { price: 2, percent: 10 });
  assert.deepEqual(normalizeSuggestedPriceSettings(migrated), migrated);
});

test('v2 migration preserves custom minimums, discounts, steps and visibility', () => {
  const previous = { ...previousDefaults, showOnCards: false, minimumDiscountPercent: 12, tiers: { ...previousDefaults.tiers, under5: { maximumDiscountPercent: 16, roundingStep: .25 } } };
  const migrated = normalizeSuggestedPriceSettings(previous);
  assert.equal(migrated.showOnCards, false);
  assert.deepEqual(migrated.tiers.under5, { minimumDiscountPercent: 12, maximumDiscountPercent: 16, roundingStep: .25 });
  assert.equal(migrated.tiers.under50.minimumDiscountPercent, 12);
  assert.equal(migrated.tiers.under50.roundingStep, 3);
});

test('settings auto-saved by older versions start with card suggestions hidden', () => {
  const v3 = normalizeSuggestedPriceSettings({ ...defaults, showOnCards: true, tiers: { ...defaults.tiers, under5: { minimumDiscountPercent: 7, maximumDiscountPercent: 12, roundingStep: .25 } } });
  const migrated = readSuggestedPriceSettings({ getItem: key => key.endsWith(':v3') ? JSON.stringify(v3) : null });
  assert.equal(migrated.showOnCards, false);
  assert.deepEqual(migrated.tiers.under5, v3.tiers.under5, 'discounts and rounding carry over');
  const chosen = { ...defaults, showOnCards: true };
  assert.equal(readSuggestedPriceSettings({ getItem: key => key === SUGGESTED_PRICE_STORAGE_KEY ? JSON.stringify(chosen) : null }).showOnCards, true);
});
