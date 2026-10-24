import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanGate } from '../src/utils/cardScanner.ts';
import { buildCardVectorIndex, cardVectorFileName, rankVisualMatches, vectorSimilarity } from '../src/utils/visualMatch.ts';

const card = (id, name, setName, number, total, image = `${id}.jpg`) => ({
  id, productId: Number(id.replace(/\D/g, '')) || 1, name, number, tcgPlayerNumber: `${number}/${total}`,
  setId: setName, setName, printing: 'Normal', variant: 'Normal', image,
});
// Gastly reprinted with the same art in Base Set and Base Set 2; Fossil has different art.
const base = card('g1', 'Gastly', 'Base Set', '50', '102');
const base2 = card('g2', 'Gastly', 'Base Set 2', '75', '130');
const fossil = card('g3', 'Gastly', 'Fossil', '33', '62');
const energy = card('e4', 'Energy Search', 'Fossil', '59', '62');
const scores = { 'g1.jpg': 0.804, 'g2.jpg': 0.798, 'g3.jpg': 0.708, 'e4.jpg': 0.4 };
const similarity = value => scores[value.image];

test('the image shortlists same-art reprints and the collector number picks the set', () => {
  const unread = rankVisualMatches([base, base2, fossil, energy], similarity, '');
  assert.deepEqual(unread.shortlist.map(group => group.cards[0].setName), ['Base Set', 'Base Set 2']);
  assert.equal(unread.resolved, null);
  const read = rankVisualMatches([base, base2, fossil, energy], similarity, 'LV. 8 #92\n75/130');
  assert.equal(read.resolved.cards[0].setName, 'Base Set 2');
});

test('a clear single art needs no number, and a frame with no card matches nothing', () => {
  assert.equal(rankVisualMatches([energy, base], value => value === energy ? 0.676 : 0.549, '').resolved.cards[0].name, 'Energy Search');
  assert.equal(rankVisualMatches([base, base2], () => 0.3, '75/130'), null);
  assert.equal(rankVisualMatches([base], () => undefined, ''), null, 'cards without vectors are left to OCR');
});

test('a held card stays latched whether or not its number was read', () => {
  const gate = createScanGate();
  const unread = rankVisualMatches([base, base2], similarity, '');
  const read = rankVisualMatches([base, base2], similarity, '75/130');
  gate.commit(unread.gateKey, ...unread.latchKeys);
  assert.equal(gate.isLatched(read.gateKey), true);
  assert.equal(gate.observe(read.gateKey), false);
  const other = rankVisualMatches([fossil], () => 0.8, '');
  assert.equal(gate.isLatched(other.gateKey), false, 'a different card is not blocked');
});

test('int8 vector files decode to the cosine similarity of the original vectors', () => {
  const vector = [0.6, -0.8, 0];
  const max = 0.8;
  const quantized = Int8Array.from(vector.map(value => Math.round(value / max * 127)));
  const file = {
    version: 1, model: 'm', dims: 3, images: ['a.jpg'],
    scales: Buffer.from(Float32Array.of(max / 127).buffer).toString('base64'),
    vectors: Buffer.from(quantized.buffer).toString('base64'),
  };
  const index = buildCardVectorIndex([file]);
  assert.ok(Math.abs(vectorSimilarity(Float32Array.from(vector), index.rows.get('a.jpg')) - 1) < 0.01);
  assert.equal(cardVectorFileName('EX Ruby & Sapphire'), 'ex-ruby-sapphire.json');
  assert.equal(cardVectorFileName('Pokémon'), 'pokemon.json');
});

test('a reprint whose reference photo scored low is still chosen by its number', () => {
  // Base Set's reference is a different photo source and scores far below its twin.
  const lowBase = { ...base, image: 'low.jpg' };
  const shadowless = card('g5', 'Gastly', 'Base Set (Shadowless)', '50', '102');
  const score = value => ({ 'low.jpg': 0.648, 'g5.jpg': 0.805, 'g2.jpg': 0.798 })[value.image];
  const unread = rankVisualMatches([lowBase, shadowless, base2], score, '');
  assert.deepEqual(unread.related.map(group => group.cards[0].setName), ['Base Set']);
  // Base Set and Shadowless share 50/102, so the number alone must leave both open.
  assert.equal(rankVisualMatches([lowBase, shadowless, base2], score, '50/102').resolved, null);
  assert.equal(rankVisualMatches([lowBase, base2], value => value === base2 ? 0.7 : 0.648, '50/102').resolved.cards[0].setName, 'Base Set');
});
