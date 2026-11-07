import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearScanMatch, groupScanCards, rankScanMatches } from '../src/utils/cardScanner.ts';
import { collectionScopeNames } from '../src/utils/collectionTree.ts';
import {
  cardsByProduct, checkCollectionGroups, checkPriceAlert, checkScan, checkStatusText, collectionCopies, conditionCountsText,
  DEFAULT_CHECK_SETTINGS, ocrCheckCandidates, parsePriceLimit, priceAlertText, readCheckSettings, saveCheckSettings, visualCheckCandidates,
} from '../src/utils/scannerCheck.ts';
import { rankVisualMatches } from '../src/utils/visualMatch.ts';

const card = (id, productId, name, setName, number, total, printing = 'Normal', nearMint = null) => ({
  id, productId, name, number, tcgPlayerNumber: `${number}/${total}`, setId: setName, setName, printing, variant: printing,
  image: `${id}.jpg`, prices: { 'Near Mint': nearMint },
});
const entry = (collectionName, printing, conditions, origin = 'app') => ({
  collectionName, collectionId: collectionName, origin, productName: 'Card', printing, conditions, catalogGroup: null,
});
const group = (...cards) => groupScanCards(cards)[0];

// Charmander printed Unlimited and 1st Edition as two products, and reprinted in Base Set 2.
const unlimited = card('c1', 46, 'Charmander', 'Base Set', '46', '102', 'Unlimited', 5);
const first = card('c2', 47, 'Charmander', 'Base Set', '46', '102', '1st Edition', 200);
const reprint = card('c3', 80, 'Charmander', 'Base Set 2', '98', '130', 'Normal', 3);
const scope = new Set(['Binder']);

test('copies are counted across every printing of the card, within the collection only', () => {
  const inventory = new Map([
    [46, [entry('Binder', 'Unlimited', { 'Lightly Played': 1, 'Near Mint': 2 }), entry('Trade', 'Unlimited', { 'Near Mint': 9 })]],
    [47, [entry('Binder', '1st Edition', { Damaged: 1 })]],
  ]);
  assert.deepEqual(collectionCopies([unlimited, first], inventory, scope), [
    { printing: 'Unlimited', copies: 3, conditions: [{ condition: 'Near Mint', copies: 2 }, { condition: 'Lightly Played', copies: 1 }] },
    { printing: '1st Edition', copies: 1, conditions: [{ condition: 'Damaged', copies: 1 }] },
  ]);
  const result = checkScan([group(unlimited, first)], inventory, scope);
  assert.equal(result.verdict, 'held');
  assert.equal(result.candidates[0].copies, 4);
  assert.equal(result.candidates[0].mixedPrintings, true, 'the camera cannot tell which printing this one is');
});

test('a Collectr collection answers like an own one, and its copies without condition are named', () => {
  const inventory = new Map([[46, [entry('Collectr binder', null, { Unknown: 3 }, 'collectr')]]]);
  const [held] = checkScan([group(unlimited)], inventory, new Set(['Collectr binder'])).candidates[0].printings;
  assert.equal(held.copies, 3);
  assert.equal(conditionCountsText(held), 'Sin estado 3');
  assert.equal(held.printing, 'Unlimited', 'a product with one catalog card names its copies');
});

test('a copy is named by its catalog variant, even when two share the printing Normal', () => {
  const regular = { ...card('p1', 42402, 'Pikachu', 'Base Set', '58', '102', 'Normal', 10), cardVariantTopLevel: 'Standard' };
  const stamp = { ...card('p2', 123633, 'Pikachu', 'Base Set', '58', '102', 'Normal', 900), variant: 'E3 Stamp', cardVariantTopLevel: 'Stamp' };
  const inventory = new Map([
    [42402, [entry('Binder', 'Normal', { 'Near Mint': 1 })]],
    [123633, [entry('Binder', 'Normal', { 'Near Mint': 2 })]],
  ]);
  const [candidate] = checkScan([group(regular, stamp)], inventory, scope).candidates;
  assert.deepEqual(candidate.printings.map(entry => entry.printing), ['E3 Stamp', 'Normal']);
  assert.equal(candidate.mixedPrintings, false, 'a stamp is told apart by hand');
  assert.equal(candidate.card, regular, 'the ordinary card is the one shown');
});

test('one catalog product holding two printings keeps them apart, and no printing stays unnamed', () => {
  const shadowless = { ...card('s2', 107055, 'Pikachu', 'Base Set (Shadowless)', '58', '102', 'Unlimited'), variant: 'Normal (Shadowless)' };
  const shadowlessFirst = { ...shadowless, id: 's3', printing: '1st Edition', variant: '1st Edition (Shadowless)' };
  const inventory = new Map([[107055, [entry('Binder', '1st Edition', { 'Near Mint': 1 }), entry('Binder', null, { Unknown: 1 })]]]);
  assert.deepEqual(collectionCopies([shadowless, shadowlessFirst], inventory, scope).map(entry => entry.printing), ['1st Edition (Shadowless)', 'Sin impresión']);
});

test('a collection counts its subcollections', () => {
  const collections = [{ id: 'a', name: 'Vintage', parentId: null }, { id: 'b', name: 'Base', parentId: 'a' }];
  const inventory = new Map([[46, [entry('Base', 'Unlimited', { 'Near Mint': 1 })]]]);
  assert.equal(checkScan([group(unlimited)], inventory, new Set(collectionScopeNames(collections, 'Vintage'))).verdict, 'held');
  assert.equal(checkScan([group(unlimited)], inventory, new Set(['Other'])).verdict, 'absent');
});

test('possible cards answer only when they all agree', () => {
  const groups = groupScanCards([unlimited, reprint]);
  const one = new Map([[46, [entry('Binder', 'Unlimited', { 'Near Mint': 1 })]]]);
  const both = new Map([...one, [80, [entry('Binder', 'Normal', { 'Near Mint': 1 })]]]);
  assert.equal(checkScan(groups, one, scope).verdict, 'unclear', 'never a false yes or no');
  assert.equal(checkScan(groups, both, scope).verdict, 'held');
  assert.equal(checkScan(groups, new Map(), scope).verdict, 'absent');
});

test('a card without a product id or a doubtful read never says no', () => {
  const untracked = { ...unlimited, productId: undefined };
  assert.equal(checkScan([group(untracked)], new Map(), scope).verdict, 'unclear');
  assert.equal(checkScan([group(unlimited)], new Map(), scope, { openEnded: true }).verdict, 'unclear');
});

test('filtering to one variant answers for that variant only', () => {
  // Fossil-style: 1st Edition and Unlimited are two printings of one product.
  const regular = card('f1', 44435, 'Gastly', 'Fossil', '33', '62', 'Unlimited', 2);
  const stamped = card('f2', 44435, 'Gastly', 'Fossil', '33', '62', '1st Edition', 40);
  const catalogByProduct = cardsByProduct([regular, stamped]);
  const inventory = new Map([[44435, [entry('Binder', '1st Edition', { 'Near Mint': 1 })]]]);
  assert.equal(checkScan([group(regular)], inventory, scope, { catalogByProduct }).verdict, 'absent', 'a 1st Edition is not an Unlimited');
  const [candidate] = checkScan([group(stamped)], inventory, scope, { catalogByProduct }).candidates;
  assert.deepEqual(candidate.printings.map(entry => entry.printing), ['1st Edition']);
  assert.equal(candidate.mixedPrintings, false, 'one selected printing leaves nothing to compare');
  assert.equal(checkScan([group(regular, stamped)], inventory, scope, { catalogByProduct }).verdict, 'held', 'unfiltered, it counts');
  const noPrinting = new Map([[44435, [entry('Binder', null, { Unknown: 1 })]]]);
  assert.equal(checkScan([group(regular)], noPrinting, scope, { catalogByProduct }).verdict, 'held', 'a copy with no printing could be this one');
});

test('only the collector number settles an image match against its reprints', () => {
  const cards = [unlimited, reprint];
  const similarity = value => (value === unlimited ? 0.8 : 0.5);
  const unread = rankVisualMatches(cards, similarity, '');
  assert.equal(unread.resolvedBy, 'image');
  assert.deepEqual(visualCheckCandidates(unread, '').map(entry => entry.cards[0].setName), ['Base Set', 'Base Set 2']);
  const read = rankVisualMatches(cards, similarity, '98/130');
  assert.deepEqual(visualCheckCandidates(read, '98/130').map(entry => entry.cards[0].setName), ['Base Set 2']);
});

test('a number shared by two sets narrows the list to those two', () => {
  const shadowless = card('s1', 60, 'Charmander', 'Base Set (Shadowless)', '46', '102');
  const cards = [unlimited, shadowless, reprint];
  const visual = rankVisualMatches(cards, () => 0.8, '46/102');
  assert.equal(visual.resolved, null);
  assert.deepEqual(visualCheckCandidates(visual, '46/102').map(entry => entry.cards[0].setName).sort(), ['Base Set', 'Base Set (Shadowless)']);
});

test('name and number settle an OCR read with several printings', () => {
  const matches = rankScanMatches([unlimited, first], 'Charmander', '46/102');
  assert.equal(clearScanMatch(matches).cards.length, 2);
  assert.equal(clearScanMatch(rankScanMatches([unlimited, first], 'Charmander', '')), null);
});

test('an exact OCR read closes the list to the sets it ties on; a fuzzy one stays open', () => {
  const shadowless = card('s1', 60, 'Charmander', 'Base Set (Shadowless)', '46', '102');
  const exact = ocrCheckCandidates(rankScanMatches([unlimited, shadowless, reprint], 'Charmander', '46/102'));
  assert.equal(exact.openEnded, false);
  assert.deepEqual(exact.groups.map(entry => entry.cards[0].setName).sort(), ['Base Set', 'Base Set (Shadowless)']);
  const fuzzy = ocrCheckCandidates(rankScanMatches([unlimited, reprint], 'Charmander', ''));
  assert.equal(fuzzy.openEnded, true);
  assert.equal(fuzzy.groups.length, 2);
});

test('the price alert fires only above the limit', () => {
  assert.equal(checkPriceAlert([group(unlimited)], null), null);
  assert.equal(checkPriceAlert([group(unlimited)], 5), null, 'exactly the limit does not exceed it');
  assert.deepEqual(checkPriceAlert([group(unlimited)], 4), { level: 'over', price: 5, where: '' });
});

test('a printing the camera cannot rule out still alerts, and says which one', () => {
  const alert = checkPriceAlert([group(unlimited, first)], 100);
  assert.deepEqual(alert, { level: 'maybe', price: 200, where: '1st Edition' });
  assert.equal(priceAlertText(alert, 100), 'Podría superar $100.00: $200.00 · 1st Edition');
  assert.equal(checkPriceAlert([group(unlimited, first)], 1).level, 'over');
  assert.equal(checkPriceAlert(groupScanCards([unlimited, first, reprint]), 100).where, 'Base Set · 1st Edition');
});

test('a rarity sharing the number does not alert on every ordinary copy', () => {
  const regular = { ...unlimited, cardVariantTopLevel: 'Standard' };
  const firstEdition = { ...first, cardVariantTopLevel: '1st Edition' };
  const jumbo = { ...card('j1', 231451, 'Charmander', 'Base Set', '46', '102', 'Normal', 900), variant: 'Jumbo Size', cardVariantTopLevel: 'Jumbo' };
  assert.equal(checkPriceAlert([group(regular, jumbo)], 100), null);
  assert.equal(checkPriceAlert([group(regular, firstEdition, jumbo)], 100).price, 200);
  assert.equal(checkPriceAlert([group(jumbo)], 100).level, 'over', 'a card that only exists as a rarity still compares');
});

test('the best available price stands in for Near Mint, and a missing price is reported', () => {
  const lightlyPlayed = { ...unlimited, prices: { 'Near Mint': null, 'Lightly Played': 150 } };
  assert.equal(checkPriceAlert([group(lightlyPlayed)], 100).level, 'over');
  const unpriced = { ...unlimited, prices: {} };
  assert.deepEqual(checkPriceAlert([group(unpriced)], 100), { level: 'unpriced', price: null, where: '' });
  assert.equal(priceAlertText({ level: 'unpriced', price: null, where: '' }, 100), 'Sin precio para comparar con $100.00');
});

test('the price limit reads blank, comma decimals and rejects anything else', () => {
  assert.equal(parsePriceLimit(''), null);
  assert.equal(parsePriceLimit('  '), null);
  assert.equal(parsePriceLimit('12,50'), 12.5);
  assert.equal(parsePriceLimit('$ 100'), 100);
  assert.equal(parsePriceLimit('0'), 0);
  assert.ok(Number.isNaN(parsePriceLimit('abc')));
  assert.ok(Number.isNaN(parsePriceLimit('-5')));
});

test('the status line states the answer for each verdict', () => {
  const inventory = new Map([[46, [entry('Binder', 'Unlimited', { 'Near Mint': 1 })]]]);
  assert.match(checkStatusText(checkScan([group(unlimited)], inventory, scope), 'Binder'), /sí está en Binder \(1 copia\)/);
  assert.match(checkStatusText(checkScan([group(reprint)], inventory, scope), 'Binder'), /no está en Binder/);
  assert.match(checkStatusText(checkScan(groupScanCards([unlimited, reprint]), inventory, scope), 'Binder'), /lectura dudosa/);
});

test('every collection is offered, grouped by origin with its path', () => {
  const collection = (id, name, origin, kind = 'owned', parentId = null) => ({ id, name, origin, kind, parentId });
  const groups = checkCollectionGroups([
    collection('a', 'Vintage', 'app'), collection('b', 'Base', 'collectr', 'owned', 'a'),
    collection('c', 'Trade', 'collectr'), collection('d', 'Wants', 'app', 'wishlist'),
  ]);
  assert.deepEqual(groups, [
    { label: 'Propias', options: [{ name: 'Vintage', label: 'Vintage (con subcolecciones)' }] },
    { label: 'Collectr', options: [{ name: 'Trade', label: 'Trade' }, { name: 'Base', label: 'Vintage › Base' }] },
    { label: 'Listas de deseos', options: [{ name: 'Wants', label: 'Wants' }] },
  ]);
  const nested = checkCollectionGroups([collection('b', 'Base', 'app', 'owned', 'a'), collection('a', 'Vintage', 'app')]);
  assert.deepEqual(nested[0].options.map(option => option.name), ['Vintage', 'Base'], 'a parent comes before its children');
  const looped = [collection('x', 'X', 'app', 'owned', 'y'), collection('y', 'Y', 'app', 'owned', 'x')];
  assert.equal(checkCollectionGroups(looped)[0].options.length, 2, 'a parent loop in bad data ends');
});

test('settings survive a round trip and bad data falls back to the defaults', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(readCheckSettings(storage), DEFAULT_CHECK_SETTINGS);
  const settings = { checking: true, collection: 'Binder', limit: '20' };
  saveCheckSettings(storage, settings);
  assert.deepEqual(readCheckSettings(storage), settings);
  data.set([...data.keys()][0], '{oops');
  assert.deepEqual(readCheckSettings(storage), DEFAULT_CHECK_SETTINGS);
});
