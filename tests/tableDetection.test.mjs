import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardProjection } from '../src/utils/cardDetection.ts';
import { detectTableCards, frameSharpness, readingOrder, sameLayout } from '../src/utils/tableDetection.ts';

const width = 960, height = 720;
const wood = (x, y) => { const grain = (x * 13 + y * 3) % 18; return [132 + grain, 104 + grain, 78 + grain]; };
const felt = () => [38, 92, 66];

/** A photo of a table with cards, each described by centre, height and rotation in degrees. */
function photo(cards, { table = wood, border = [224, 196, 52], light = () => 1 } = {}) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const placed = cards.map(card => {
    const angle = card.angle * Math.PI / 180;
    return { ...card, ux: Math.cos(angle), uy: Math.sin(angle), halfW: (card.size ?? 240) * 63 / 88 / 2, halfH: (card.size ?? 240) / 2 };
  });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let color = table(x, y);
    for (const card of placed) {
      const dx = x - card.x, dy = y - card.y;
      const u = dx * card.ux + dy * card.uy, v = dy * card.ux - dx * card.uy;
      if (Math.abs(u) > card.halfW || Math.abs(v) > card.halfH) continue;
      const inner = Math.abs(u) < card.halfW * 0.88 && Math.abs(v) < card.halfH * 0.9;
      // The art has table-like colours on purpose, so holes must not split the card.
      color = !inner ? (card.border ?? border) : Math.abs(v) < card.halfH * 0.3 ? table(x, y) : [200, 188, 150];
    }
    const shade = light(x, y);
    pixels.set([color[0] * shade, color[1] * shade, color[2] * shade, 255], (y * width + x) * 4);
  }
  return pixels;
}

const centerOf = quad => ({ x: quad.reduce((sum, p) => sum + p.x, 0) / 4, y: quad.reduce((sum, p) => sum + p.y, 0) / 4 });
const assertFound = (detection, cards) => {
  assert.equal(detection.quads.length, cards.length);
  for (const card of cards) {
    assert.ok(detection.quads.some(quad => Math.hypot(centerOf(quad).x - card.x, centerOf(quad).y - card.y) < 12), `card at ${card.x},${card.y}`);
  }
};

const grid = [
  { x: 150, y: 170, angle: 0 }, { x: 420, y: 170, angle: 8 }, { x: 700, y: 170, angle: -12 },
  { x: 150, y: 520, angle: 90 }, { x: 460, y: 520, angle: 35 }, { x: 790, y: 520, angle: 180 },
];

test('every card on a table is found, at any angle, in reading order', () => {
  const detection = detectTableCards(photo(grid), width, height);
  assertFound(detection, grid);
  assert.equal(detection.rejected, 0);
  const centers = detection.quads.map(centerOf);
  assert.ok(centers[0].x < centers[1].x && centers[1].x < centers[2].x, 'top row left to right');
  assert.ok(centers[3].y > centers[0].y + 200, 'second row after the first');
});

test('a quad straightens into the card: the short side comes first and corners go clockwise', () => {
  const card = { x: 480, y: 360, angle: 25 };
  const { quads: [quad] } = detectTableCards(photo([card]), width, height);
  const short = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const long = Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y);
  assert.ok(Math.abs(short / long - 63 / 88) < 0.05, `ratio ${short / long}`);
  const project = cardProjection(quad);
  const middle = project(0.5, 0.5);
  assert.ok(Math.hypot(middle.x - card.x, middle.y - card.y) < 6);
});

test('a dark table and a silver border work the same', () => {
  const cards = grid.slice(0, 3);
  assertFound(detectTableCards(photo(cards, { table: felt, border: [176, 180, 186] }), width, height), cards);
});

test('uneven light across the table does not hide the cards', () => {
  const cards = grid.slice(0, 4);
  assertFound(detectTableCards(photo(cards, { light: x => 0.7 + 0.45 * x / width }), width, height), cards);
});

test('small cards in a crowded layout are still found', () => {
  const cards = [];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 5; column++) cards.push({ x: 110 + column * 185, y: 120 + row * 240, angle: 0, size: 200 });
  assertFound(detectTableCards(photo(cards), width, height), cards);
});

test('touching cards are reported, never guessed at as one card', () => {
  const row = [{ x: 200, y: 360, angle: 0 }, { x: 372, y: 360, angle: 0 }, { x: 544, y: 360, angle: 0 }];
  const three = detectTableCards(photo(row), width, height);
  assert.equal(three.quads.length, 0, 'three in a row are too long to be a card');
  assert.equal(three.rejected, 1);
  // Two upright cards side by side make the shape of one card lying down.
  const pair = detectTableCards(photo([{ x: 200, y: 200, angle: 0 }, { x: 372, y: 200, angle: 0 }, { x: 760, y: 520, angle: 0 }]), width, height);
  assertFound(pair, [{ x: 760, y: 520 }]);
  assert.equal(pair.rejected, 1, 'its size next to the others gives it away');
});

test('a card cut off by the edge of the photo is not treated as a whole card', () => {
  const detection = detectTableCards(photo([{ x: 40, y: 360, angle: 0 }, { x: 500, y: 360, angle: 0 }]), width, height);
  assertFound(detection, [{ x: 500, y: 360 }]);
});

test('other things on the table are not cards', () => {
  const pixels = photo([{ x: 300, y: 360, angle: 0 }]);
  const object = (x, y, color) => pixels.set([...color, 255], (y * width + x) * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (Math.hypot(x - 700, y - 200) < 80) object(x, y, [40, 40, 44]); // a coaster
    if (x > 560 && x < 900 && y > 480 && y < 510) object(x, y, [30, 50, 150]); // a pen
  }
  assertFound(detectTableCards(pixels, width, height), [{ x: 300, y: 360 }]);
});

test('an empty table finds nothing, and a bad buffer is refused', () => {
  assert.deepEqual(detectTableCards(photo([]), width, height), { quads: [], rejected: 0 });
  assert.deepEqual(detectTableCards(new Uint8ClampedArray(8), 960, 720), { quads: [], rejected: 0 });
});

test('reading order groups a slightly crooked row', () => {
  const card = (x, y) => ({ center: { x, y }, shortSide: 100 });
  assert.deepEqual(readingOrder([card(300, 110), card(100, 130), card(200, 400)]).map(entry => entry.center.x), [100, 300, 200]);
});

test('the layout counts as unchanged only while no card moves', () => {
  const quad = (x, y) => [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 14 }, { x, y: y + 14 }];
  assert.equal(sameLayout([quad(0, 0), quad(50, 0)], [quad(52, 1), quad(1, 1)], 5), true);
  assert.equal(sameLayout([quad(0, 0)], [quad(30, 0)], 5), false);
  assert.equal(sameLayout([quad(0, 0)], [quad(0, 0), quad(50, 0)], 5), false);
});

test('a blurred frame scores below a sharp one', () => {
  const size = 80;
  const sharp = new Uint8ClampedArray(size * size * 4), soft = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const value = (x >> 2) % 2 ? 230 : 20;
    sharp.fill(value, (y * size + x) * 4, (y * size + x) * 4 + 4);
    soft.fill(100 + value / 8, (y * size + x) * 4, (y * size + x) * 4 + 4);
  }
  assert.ok(frameSharpness(sharp, size, size) > frameSharpness(soft, size, size) * 10);
});
