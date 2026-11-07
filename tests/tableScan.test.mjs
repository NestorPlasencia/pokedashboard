import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupScanCards, rankScanMatches } from '../src/utils/cardScanner.ts';
import { checkScan } from '../src/utils/scannerCheck.ts';
import { cardsTooSmall, ocrTableRead, readTableMode, saveTableMode, tableCheckSummary, tableCheckTone, tableDraft, visualTableRead } from '../src/utils/tableScan.ts';
import { rankVisualMatches } from '../src/utils/visualMatch.ts';

const card = (id, productId, name, setName, number, total, printing = 'Normal') => ({
  id, productId, name, number, tcgPlayerNumber: `${number}/${total}`, setId: setName, setName, printing, variant: printing,
  image: `${id}.jpg`, prices: {},
});
const base = card('g1', 42394, 'Gastly', 'Base Set', '50', '102');
const base2 = card('g2', 42495, 'Gastly', 'Base Set 2', '75', '130');
const energy = card('e1', 44461, 'Energy Search', 'Fossil', '59', '62');
const cards = [base, base2, energy];
const batch = { condition: 'Lightly Played', collectionId: 'binder', id: 'copy-1', createdAt: '2026-10-31T00:00:00Z' };

test('a card settled by its number makes a draft with that card chosen', () => {
  const read = visualTableRead(rankVisualMatches(cards, value => (value === energy ? 0.1 : 0.8), '75/130'), '75/130');
  assert.deepEqual(read.groups.map(group => group.cards[0].id), ['g2']);
  assert.equal(read.detail, 'Base Set 2 · 75');
  const draft = tableDraft(read, cards, batch);
  assert.equal(draft.cardId, 'g2');
  assert.equal(draft.approved, false, 'review still has the last word');
  assert.equal(draft.condition, 'Lightly Played');
  assert.equal(draft.collectionId, 'binder');
  assert.deepEqual(draft.candidates.map(entry => entry.id).sort(), ['g1', 'g2'], 'the reprint stays selectable');
  assert.match(draft.note, /La imagen y el número coinciden/);
});

test('without the number a same-art reprint leaves the choice to review', () => {
  const read = visualTableRead(rankVisualMatches(cards, value => (value === energy ? 0.1 : 0.8), ''), '');
  assert.equal(read.groups.length, 2);
  assert.match(read.detail, /2 sets posibles/);
  assert.equal(tableDraft(read, cards, batch).cardId, '', 'nothing is preselected');
});

test('OCR reads carry over: exact closes the list, doubtful stays open', () => {
  const exact = ocrTableRead(rankScanMatches(cards, 'Gastly', '75/130'));
  assert.equal(exact.openEnded, false);
  assert.equal(exact.preferredId, 'g2');
  const doubtful = ocrTableRead(rankScanMatches(cards, 'Gastly', ''));
  assert.equal(doubtful.openEnded, true);
  assert.equal(doubtful.preferredId, undefined);
  assert.equal(ocrTableRead([]), null);
});

test('the summary counts the table, and only real price alerts', () => {
  const inventory = new Map([[42394, [{ collectionName: 'Binder', printing: 'Normal', conditions: { 'Near Mint': 1 } }]]]);
  const scope = new Set(['Binder']);
  const held = { result: checkScan(groupScanCards([base]), inventory, scope), alert: null };
  const absent = { result: checkScan(groupScanCards([base2]), inventory, scope), alert: { level: 'over', price: 50, where: '' } };
  const unclear = { result: checkScan(groupScanCards([base, base2]), inventory, scope), alert: { level: 'unpriced', price: null, where: '' } };
  assert.equal(tableCheckSummary([held, absent, unclear], 1), '1 está · 1 no está · 1 dudosa · 1 sin reconocer · 1 sobre tu límite');
  assert.equal(tableCheckSummary([held, held, unclear, unclear], 0), '2 están · 0 no están · 2 dudosas');
  assert.deepEqual([held, absent, unclear].map(tableCheckTone), ['held', 'alert', 'unclear']);
});

test('a photo with small cards is flagged before the numbers fail to read', () => {
  assert.equal(cardsTooSmall([]), false);
  assert.equal(cardsTooSmall([900, 800]), false);
  assert.equal(cardsTooSmall([900, 420]), true);
});

test('the mode is remembered and defaults to one card at a time', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(readTableMode(storage), false);
  saveTableMode(storage, true);
  assert.equal(readTableMode(storage), true);
  assert.equal(readTableMode({ getItem: () => { throw new Error('blocked'); } }), false);
});
