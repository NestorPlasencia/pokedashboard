import { test } from 'node:test';
import assert from 'node:assert/strict';
import { automaticScanMatch, BASE_GYM_SCAN_SCOPE, cameraSourceRect, cardsInScanScope, createScanGate, defaultDraftCardId, draftQuantity, groupScanCards, mainBackCamera, rankScanMatches, scanPrinting, scanScopeFromFilters, withDraftQuantity } from '../src/utils/cardScanner.ts';
import { parseUrlParams } from '../src/utils/urlParams.ts';

const card = (patch = {}) => ({
  id: 'base-charizard', productId: 1, name: 'Charizard', number: '4',
  tcgPlayerNumber: '004/102', setId: 'base', setName: 'Base Set',
  setNames: ['Base Set'], setSeries: 'Base', setSeriesNames: ['Base'],
  printing: 'Holofoil', variant: 'Normal', ...patch,
});
const scope = { series: ['Base', 'Gym'], sets: [], min: '', max: '' };

test('eras, sets and inclusive numbers are hard boundaries; an empty selection scans nothing', () => {
  const cards = [card(), card({ id: 'gym', setId: 'gym', setName: 'Gym Heroes', setNames: ['Gym Heroes'], setSeries: 'Gym', setSeriesNames: ['Gym'], number: '20' }),
    card({ id: 'modern', setSeries: 'Scarlet & Violet', setSeriesNames: ['Scarlet & Violet'] }), card({ id: 'tg', number: 'TG04' })];
  assert.deepEqual(cardsInScanScope(cards, { ...scope, min: '4', max: '20' }).map(value => value.id), ['base-charizard', 'gym']);
  assert.deepEqual(cardsInScanScope(cards, { ...scope, sets: ['Gym Heroes'] }).map(value => value.id), ['gym']);
  assert.equal(cardsInScanScope(cards, { ...scope, series: [] }).length, 0);
  assert.equal(cardsInScanScope(cards, { ...scope, min: '5', max: '4' }).length, 0);
  assert.equal(cardsInScanScope(cards, { ...scope, min: '-1' }).length, 0);
  assert.equal(cardsInScanScope(cards, { ...scope, max: '4.5' }).length, 0);
});

test('identification combines name and collector fraction, preserving printing alternatives', () => {
  const cards = [card(), card({ id: 'first', printing: '1st Edition Holofoil' })];
  assert.equal(groupScanCards(cards).length, 1);
  assert.equal(groupScanCards(cards)[0].cards.length, 2);
  const matches = rankScanMatches(cards, 'STAGE 2 Charizard 120 HP', '© 1999 Wizards 4/102 ★');
  assert.equal(matches[0].cards.length, 2);
  assert.equal(matches[0].score, 110);
  assert.equal(automaticScanMatch(matches), null, 'printing is configured first, never guessed');
  assert.equal(automaticScanMatch(rankScanMatches([cards[1]], 'Charizard', '4 / 102')).card.id, 'first');
});

test('the requested catalog link restores sets, rarities and Standard variants with identical granularity', () => {
  const query = '?series=Base|Gym&set=Gym_Challenge|Gym_Heroes|Team_Rocket|Base_Set_2|Fossil|Jungle|Base_Set&rarity=Common|Uncommon|Rare&cardVariantTopLevel=Standard&formsAllowVariants=Default&order=Pokedex';
  const restored = scanScopeFromFilters(parseUrlParams(query));
  assert.deepEqual(restored, BASE_GYM_SCAN_SCOPE);
  const ordinary = card({ rarity: 'Common', rarities: ['Common'], cardVariantTopLevel: 'Standard' });
  const cards = [ordinary, card({ id: 'holo-rare', rarity: 'Rare Holo', rarities: ['Rare Holo'], cardVariantTopLevel: 'Standard' }),
    card({ id: 'jumbo', rarity: 'Common', rarities: ['Common'], cardVariantTopLevel: 'Jumbo' }),
    card({ id: 'promo', setName: 'Wizards Black Star Promos', setNames: ['Wizards Black Star Promos'], rarity: 'Common', cardVariantTopLevel: 'Standard' })];
  assert.deepEqual(cardsInScanScope(cards, restored).map(value => value.id), ['base-charizard']);
  assert.deepEqual(cardsInScanScope(cards, { ...restored, variants: ['Shadowless'] }), []);
});

test('name alone, number alone, fuzzy names, or conflicting totals cannot auto-add', () => {
  for (const [name, number] of [['Charizard', ''], ['', '4/102'], ['Charizand', '4/102'], ['Charizard', '4/130']]) {
    assert.equal(automaticScanMatch(rankScanMatches([card()], name, number)), null, `${name} ${number}`);
  }
  assert.equal(automaticScanMatch(rankScanMatches([card()], 'Charizard', '120 HP 40 20 1999')), null, 'attack/HP/copyright numbers are not collector numbers');
});

test('same-name reprints in two sets remain ambiguous until there is distinguishing evidence', () => {
  const reprint = card({ id: 'base2-charizard', setId: 'base2', setName: 'Base Set 2', setNames: ['Base Set 2'], productId: 2, tcgPlayerNumber: '004/130' });
  assert.equal(automaticScanMatch(rankScanMatches([card(), reprint], 'Charizard', '4')), null);
  assert.equal(automaticScanMatch(rankScanMatches([card(), reprint], 'Charizard', '4/102')).card.id, 'base-charizard');
});

test('missing product ids and multiple products for the same logical card require review', () => {
  assert.equal(automaticScanMatch(rankScanMatches([card({ productId: undefined })], 'Charizard', '4/102')), null);
  assert.equal(automaticScanMatch(rankScanMatches([card(), card({ id: 'other-product', productId: 2 })], 'Charizard', '4/102')), null);
});

test('two stable reads are required; a held card never repeats even across blurry frames or pause', () => {
  const gate = createScanGate();
  assert.equal(gate.observe('charizard'), false);
  assert.equal(gate.observe(null), false);
  assert.equal(gate.observe('charizard'), false);
  assert.equal(gate.observe('charizard'), true);
  gate.commit('charizard');
  for (const key of ['charizard', null, null, 'charizard', 'charizard']) assert.equal(gate.observe(key), false);
  assert.equal(gate.observe('pikachu'), false);
  assert.equal(gate.observe('charizard'), false);
  assert.equal(gate.observe('pikachu'), false);
  assert.equal(gate.observe('pikachu'), true);
  gate.commit('pikachu');
  assert.equal(gate.observe('charizard'), false);
  assert.equal(gate.observe('charizard'), true, 'returning after a different card represents another physical copy');
});

test('a failed write is not latched, while another identical physical copy can be explicitly armed', () => {
  const gate = createScanGate();
  gate.observe('a');
  assert.equal(gate.observe('a'), true);
  assert.equal(gate.isLatched('a'), false, 'do not mark a failed save as added');
  gate.commit('a'); gate.rearm();
  assert.equal(gate.observe('a'), false);
  assert.equal(gate.observe('a'), true);
});

test('camera guide maps to the visible crop for landscape and portrait sensors', () => {
  const landscape = cameraSourceRect(1920, 1080, 300, 400, { x: 24, y: 32, width: 252, height: 336 });
  assert.ok(Math.abs(landscape.width - 680.4) < 0.001);
  assert.ok(Math.abs(landscape.height - 907.2) < 0.001);
  assert.ok(Math.abs(landscape.x - 619.8) < 0.001);
  assert.ok(Math.abs(landscape.y - 86.4) < 0.001);
  const portrait = cameraSourceRect(1080, 1920, 300, 400, { x: 24, y: 32, width: 252, height: 336 });
  assert.ok(portrait.x >= 0 && portrait.y >= 0);
  assert.ok(portrait.x + portrait.width <= 1080 && portrait.y + portrait.height <= 1920);
});

test('the regular print counts as Normal whether the set calls it Normal or Unlimited', () => {
  assert.equal(scanPrinting(card({ printing: 'Unlimited' })), 'Normal');
  assert.equal(scanPrinting(card({ printing: 'Normal' })), 'Normal');
  assert.equal(scanPrinting(card({ printing: 'Unlimited Holofoil' })), 'Holofoil');
  assert.equal(scanPrinting(card({ printing: '1st Edition' })), '1st Edition');
});

test('short names are never matched from a one-letter misread', () => {
  const bill = card({ id: 'bill', name: 'Bill', number: '91', tcgPlayerNumber: '91/102' });
  assert.equal(rankScanMatches([bill], 'Will you search your deck', '').length, 0);
  assert.equal(rankScanMatches([bill], 'TRAINER\nBill', '').length, 1);
  assert.equal(rankScanMatches([card()], 'Charizarb', '').length, 1, 'longer names still tolerate a misread');
});

test('the scanner prefers the main rear lens over telephoto and ultra wide', () => {
  const camera = (deviceId, label) => ({ kind: 'videoinput', deviceId, label });
  assert.equal(mainBackCamera([camera('front', 'camera2 1, facing front'), camera('tele', 'camera2 2, facing back'), camera('main', 'camera2 0, facing back')]), 'main');
  assert.equal(mainBackCamera([camera('t', 'Back Telephoto Camera'), camera('u', 'Back Ultra Wide Camera'), camera('m', 'Back Camera')]), 'm');
  assert.equal(mainBackCamera([camera('x', '')]), null);
});

test('draft quantity keeps a stable id per copy and a lone candidate is chosen', () => {
  let next = 0;
  const draft = { id: 'a', candidates: [card()], cardId: '', condition: 'Near Mint', collectionId: '', approved: false, note: '', createdAt: '' };
  const three = withDraftQuantity(draft, 3, () => `id${next++}`);
  assert.equal(draftQuantity(three), 3);
  assert.deepEqual(withDraftQuantity(three, 2, () => 'new').extraCopyIds, ['id0']);
  assert.equal(draftQuantity(withDraftQuantity(three, 0, () => 'new')), 1);
  assert.equal(defaultDraftCardId([card()]), 'base-charizard');
  assert.equal(defaultDraftCardId([card(), card({ id: 'b' })]), '');
  assert.equal(defaultDraftCardId([card(), card({ id: 'b' })], 'b'), 'b');
});
