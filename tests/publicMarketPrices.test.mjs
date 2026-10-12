import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicPriceSeries, publicMarketQuote, loadPublicMarketPrices, publicCatalogImage, loadPublicCatalogImages } from '../src/utils/publicMarketPrices.ts';
import { publicCollectionResults, EMPTY_PUBLIC_COLLECTION_FILTERS } from '../src/utils/publicCollectionView.ts';

const card = fields => ({ product_id: 1, name: 'Pikachu', set_name: 'Pokémon GO', number: '001', rarity: 'Common', image_url: null, printing: 'Reverse Holofoil', condition: null, language: null, quantity: 3, ...fields });
const hierarchy = [{ id: 14, name: 'Sword & Shield', order: 1, sets: [{ id: 1, name: 'Pokemon Go', order: 1, symbolImage: null }, { id: 2, name: 'Sword & Shield', order: 2, symbolImage: null }] }];
const entry = fields => ({ printing: 'Reverse Holofoil', condition: 'Near Mint Reverse Holofoil', marketPrice: 0.15, ...fields });

test('shared set names resolve to public series IDs despite accents and base-set aliases', () => {
  assert.deepEqual(publicPriceSeries([card({}), card({ set_name: 'Sword & Shield Base Set' })], hierarchy), [14]);
  assert.deepEqual(publicPriceSeries([card({ set_name: 'Unmapped' })], hierarchy), []);
});

test('price requests send no inventory identity, quantities, session or private fields', async () => {
  const requests = [];
  const result = await loadPublicMarketPrices([card({})], hierarchy, undefined, async (url, init) => {
    requests.push({ url, init });
    return Response.json({ generatedAt: '2026-10-12T12:00:00Z', products: { 1: [entry({ notes: 'must not survive projection', purchase_price: 99 })], 999: [entry({})] } });
  });
  assert.equal(requests[0].url, '/api/prices?seriesId=14');
  assert.equal(requests[0].init.credentials, 'omit');
  assert.equal(requests[0].init.body, undefined);
  assert.deepEqual(requests[0].init.headers, { Accept: 'application/json' });
  assert.deepEqual(Object.keys(result.products), ['1']);
  assert.deepEqual(Object.keys(result.products['1'][0]).sort(), ['condition', 'marketPrice', 'printing']);
});

test('matching honours printing and condition rather than using the first available variant', () => {
  const prices = [entry({ printing: 'Normal', marketPrice: 0.01 }), entry({ condition: 'Damaged Reverse Holofoil', marketPrice: 0.02 }), entry({ marketPrice: 0.15 })];
  assert.deepEqual(publicMarketQuote(card({}), prices), { amount: 0.15, condition: 'Near Mint', reference: true });
  assert.deepEqual(publicMarketQuote(card({ condition: 'Damaged' }), prices), { amount: 0.02, condition: 'Damaged', reference: false });
  assert.equal(publicMarketQuote(card({ printing: 'Holofoil' }), prices), null);
  assert.equal(publicMarketQuote(card({ condition: 'Lightly Played' }), prices), null);
  assert.equal(publicMarketQuote(card({ printing: null }), prices), null);
  assert.equal(publicMarketQuote(card({ language: 'Spanish' }), prices), null);
});

test('zero is a valid quote; invalid amounts never become prices', () => {
  assert.equal(publicMarketQuote(card({}), [entry({ marketPrice: 0 })]).amount, 0);
  for (const marketPrice of [NaN, Infinity, -1]) assert.equal(publicMarketQuote(card({}), [entry({ marketPrice })]), null);
});

test('price ordering keeps unavailable quotes last in either direction', () => {
  const cards = [card({ product_id: 1 }), card({ product_id: 2 }), card({ product_id: 3 })];
  const prices = new Map([[cards[0], 0.1], [cards[2], 1]]);
  assert.deepEqual(publicCollectionResults(cards, '', EMPTY_PUBLIC_COLLECTION_FILTERS, 'price-asc', prices).map(c => c.product_id), [1, 3, 2]);
  assert.deepEqual(publicCollectionResults(cards, '', EMPTY_PUBLIC_COLLECTION_FILTERS, 'price-desc', prices).map(c => c.product_id), [3, 1, 2]);
});

test('a price outage is distinct from an empty or zero-valued market', async () => {
  await assert.rejects(loadPublicMarketPrices([card({})], hierarchy, undefined, async () => Response.json({ error: 'Unavailable' }, { status: 502 })), /No se pudieron cargar/);
});

test('catalog artwork belongs to the same product and printing, with no ambiguous substitution', () => {
  const source = [
    { tcgPlayerProductId: 1, printing: { name: 'Normal' }, image: 'https://images.example/normal.png' },
    { tcgPlayerProductId: 1, cardVariant: { name: 'Reverse Holofoil' }, image: 'https://images.example/reverse.png' },
    { tcgPlayerProductId: 2, printing: { name: 'Reverse Holofoil' }, image: 'https://images.example/other.png' },
  ];
  assert.equal(publicCatalogImage(card({}), source), 'https://images.example/reverse.png');
  assert.equal(publicCatalogImage(card({ printing: null }), source), null);
  assert.equal(publicCatalogImage(card({ printing: 'Holofoil' }), source), null);
  assert.equal(publicCatalogImage(card({ language: 'Spanish' }), source), null);
});

test('catalog images are fetched without credentials and preserve the original on missing data', async () => {
  const original = card({ image_url: 'https://original.example/card.png' });
  const images = await loadPublicCatalogImages([original], hierarchy, undefined, async (url, init) => {
    assert.equal(url, '/api/poke-db/cards?seriesId=14');
    assert.equal(init.credentials, 'omit');
    return Response.json({ items: [{ tcgPlayerProductId: 999, image: 'https://images.example/other.png' }] });
  });
  assert.equal(images.size, 0);
  assert.equal(original.image_url, 'https://original.example/card.png');
});

test('TCGplayer links preselect the exact printing, condition and language', async () => {
  const { publicTcgplayerUrl } = await import('../src/utils/publicMarketPrices.ts');
  assert.equal(publicTcgplayerUrl(card({ condition: 'lightly played' })),
    'https://www.tcgplayer.com/product/1?Language=English&Printing=Reverse+Holofoil&Condition=Lightly+Played');
  assert.equal(publicTcgplayerUrl(card({ printing: null })), 'https://www.tcgplayer.com/product/1?Language=English');
  assert.equal(publicTcgplayerUrl(card({ printing: '1st Edition Holofoil', language: 'Japanese', condition: 'Mint-ish' })),
    'https://www.tcgplayer.com/product/1?Printing=1st+Edition+Holofoil');
  assert.equal(publicTcgplayerUrl(card({ product_id: 0 })), null);
});

test('collection value multiplies quotes by copies and counts unpriced rows', async () => {
  const { publicCollectionValue } = await import('../src/utils/publicMarketPrices.ts');
  const a = card({ quantity: 3 }), b = card({ quantity: 2 }), c = card({ quantity: 5 });
  assert.deepEqual(publicCollectionValue([a, b, c], new Map([[a, 1.5], [b, 0]])), { amount: 4.5, unpriced: 1 });
});
