import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardProjection, detectCardBorder } from '../src/utils/cardDetection.ts';

const width = 360, height = 500;
const offCenter = [{ x: 42, y: 108 }, { x: 215, y: 92 }, { x: 229, y: 345 }, { x: 32, y: 333 }];

function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

function photo(quad, sides = [0, 1, 2, 3], solid = false) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Wood grain has brightness variation and brown hues, but no yellow card contour.
    const grain = (x * 13 + y * 3) % 30;
    let color = [130 + grain, 110 + grain, 87 + grain];
    const onBorder = sides.some(i => segmentDistance(x, y, quad[i], quad[(i + 1) % 4]) <= 3);
    const inside = solid && quad.every((p, i) => {
      const q = quad[(i + 1) % 4];
      return (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x) >= 0;
    });
    if (onBorder || inside) color = [220, 196, 45];
    pixels.set([...color, 255], (y * width + x) * 4);
  }
  return pixels;
}

test('finds all four corners of a small, off-center perspective card against wood', () => {
  const detected = detectCardBorder(photo(offCenter), width, height);
  assert.ok(detected);
  detected.forEach((point, i) => assert.ok(Math.hypot(point.x - offCenter[i].x, point.y - offCenter[i].y) <= 5));
});

test('rejects wood, solid yellow regions, and incomplete yellow contours', () => {
  assert.equal(detectCardBorder(photo(offCenter, []), width, height), null);
  assert.equal(detectCardBorder(photo(offCenter, [0, 1, 2, 3], true), width, height), null);
  for (let missing = 0; missing < 4; missing++) {
    assert.equal(detectCardBorder(photo(offCenter, [0, 1, 2, 3].filter(i => i !== missing)), width, height), null);
  }
});

test('projective warp maps the four exact corners and a known interior point', () => {
  const quad = [{ x: 20, y: 30 }, { x: 120, y: 30 }, { x: 90, y: 130 }, { x: 40, y: 130 }];
  const project = cardProjection(quad);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
    const point = project(u, v);
    assert.ok(Math.abs(point.x - quad[i].x) < 1e-8);
    assert.ok(Math.abs(point.y - quad[i].y) < 1e-8);
  });
  const center = project(0.5, 0.5);
  assert.ok(Math.abs(center.x - 200 / 3) < 1e-8);
  assert.ok(Math.abs(center.y - 290 / 3) < 1e-8);
});

test('parallel sides preserve affine geometry without division by zero', () => {
  const project = cardProjection([{ x: 10, y: 20 }, { x: 110, y: 30 }, { x: 120, y: 170 }, { x: 20, y: 160 }]);
  assert.deepEqual(project(0.5, 0.5), { x: 65, y: 95 });
});

test('invalid images and degenerate or crossing quadrilaterals fail safely', () => {
  assert.equal(detectCardBorder(new Uint8ClampedArray(), 0, 0), null);
  assert.equal(detectCardBorder(new Uint8ClampedArray(16), 360, 500), null);
  for (const quad of [
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 50, y: 0 }, { x: 0, y: 50 }],
    [{ x: NaN, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }],
  ]) assert.throws(() => cardProjection(quad), RangeError);
});
