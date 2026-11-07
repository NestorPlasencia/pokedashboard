import type { CardQuad, ImagePoint } from './cardDetection.ts';

/**
 * Finds every card lying on a table in one photo, at any angle and with any border colour.
 * `detectCardBorder` answers a different question (the one yellow card held in the guide) and
 * stays as it is. Two independent readings of the photo are combined, because each fails where
 * the other does not: difference from the table colour survives a busy card and a low-contrast
 * edge, while closed outlines survive uneven light. A strict shape test keeps both honest.
 */
export type TableDetection = {
  /** Clockwise from a short side, in reading order. Upright or upside down is not known here. */
  quads: CardQuad[];
  /** Objects big enough to be cards that are not shaped like one: touching or cut off. */
  rejected: number;
};

type Point = ImagePoint;
type Candidate = { quad: CardQuad; fill: number; center: Point; shortSide: number; longSide: number };

/** Holds even at an angle, where perspective squeezes the 63:88 shape. */
const MIN_RATIO = 0.55;
const MAX_RATIO = 0.88;
/** Rounded corners and glare cost a little of the rectangle, a hand or a merged pair far more. */
const MIN_FILL = 0.84;
const MIN_LONG_SIDE = 0.06;
const MAX_LONG_SIDE = 0.98;

function grayscale(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  return gray;
}

/** A 3×3 blur: it keeps a card's edge and removes most of the grain of a wooden table. */
function blurred(gray: Float32Array, width: number, height: number): Float32Array {
  const result = new Float32Array(gray.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, count = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const sx = x + dx, sy = y + dy;
      if (sx >= 0 && sx < width && sy >= 0 && sy < height) { sum += gray[sy * width + sx]; count++; }
    }
    result[y * width + x] = sum / count;
  }
  return result;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Sets every pixel within `radius` of a set pixel, in time independent of the radius. */
function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const across = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = -radius; x < width; x++) {
      if (x + radius < width && mask[y * width + x + radius]) count++;
      if (x - radius - 1 >= 0 && mask[y * width + x - radius - 1]) count--;
      if (x >= 0 && count > 0) across[y * width + x] = 1;
    }
  }
  const result = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = -radius; y < height; y++) {
      if (y + radius < height && across[(y + radius) * width + x]) count++;
      if (y - radius - 1 >= 0 && across[(y - radius - 1) * width + x]) count--;
      if (y >= 0 && count > 0) result[y * width + x] = 1;
    }
  }
  return result;
}

const inverted = (mask: Uint8Array) => mask.map(value => value ? 0 : 1);

const erode = (mask: Uint8Array, width: number, height: number, radius: number) =>
  inverted(dilate(inverted(mask), width, height, radius));

/** Everything the table cannot reach from the edge of the photo: art inside a card stays card. */
function fillHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const reached = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let count = 0;
  const visit = (index: number) => {
    if (!mask[index] && !reached[index]) { reached[index] = 1; queue[count++] = index; }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  for (let read = 0; read < count; read++) {
    const index = queue[read];
    const x = index % width, y = Math.floor(index / width);
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (y > 0) visit(index - width);
    if (y < height - 1) visit(index + width);
  }
  return inverted(reached);
}

/** Pixels that differ from the table, taken as the colour around the edge of the photo. */
function differenceMask(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const channels: number[][] = [[], [], []];
  const sample = (x: number, y: number) => {
    for (let channel = 0; channel < 3; channel++) channels[channel].push(data[(y * width + x) * 4 + channel]);
  };
  const stepX = Math.max(1, Math.floor(width / 120)), stepY = Math.max(1, Math.floor(height / 120));
  const margin = Math.max(1, Math.floor(Math.min(width, height) * 0.02));
  for (let x = 0; x < width; x += stepX) { sample(x, margin); sample(x, height - 1 - margin); }
  for (let y = 0; y < height; y += stepY) { sample(margin, y); sample(width - 1 - margin, y); }
  const table = channels.map(median);
  const spread = median(channels[1].map(value => Math.abs(value - table[1])));
  const threshold = Math.max(32, spread * 4);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const distance = Math.abs(data[i * 4] - table[0]) + Math.abs(data[i * 4 + 1] - table[1]) + Math.abs(data[i * 4 + 2] - table[2]);
    mask[i] = distance > threshold * 1.5 ? 1 : 0;
  }
  return mask;
}

function outlineMask(gray: Float32Array, width: number, height: number): Uint8Array {
  const smooth = blurred(blurred(gray, width, height), width, height);
  const magnitude = new Float32Array(gray.length);
  const samples: number[] = [];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const gx = smooth[i + 1] - smooth[i - 1], gy = smooth[i + width] - smooth[i - width];
    magnitude[i] = Math.abs(gx) + Math.abs(gy);
    if ((x + y * 7) % 23 === 0) samples.push(magnitude[i]);
  }
  const threshold = Math.max(12, median(samples) * 5);
  return magnitude.map(value => value > threshold ? 1 : 0) as unknown as Uint8Array;
}

function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (input: Point[]) => {
    const chain: Point[] = [];
    for (const point of input) {
      while (chain.length >= 2) {
        const a = chain[chain.length - 2], b = chain[chain.length - 1];
        if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0) break;
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** The tightest rotated box; one of its sides always lies along an edge of the hull. */
function minimumBox(hull: Point[]) {
  let best: { area: number; angle: number; center: Point; along: number; across: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const point of hull) {
      const u = point.x * ux + point.y * uy, v = point.y * ux - point.x * uy;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      const midU = (minU + maxU) / 2, midV = (minV + maxV) / 2;
      best = { area, angle, center: { x: midU * ux - midV * uy, y: midU * uy + midV * ux }, along: maxU - minU, across: maxV - minV };
    }
  }
  return best;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** A blob's corners, kept as photographed so a card seen at an angle can still be straightened. */
function cardCorners(hull: Point[], box: NonNullable<ReturnType<typeof minimumBox>>): { quad: CardQuad; long: number; short: number } {
  const alongLong = box.along >= box.across;
  const angle = alongLong ? box.angle : box.angle + Math.PI / 2;
  const long = Math.max(box.along, box.across), short = Math.min(box.along, box.across);
  let down = { x: Math.cos(angle), y: Math.sin(angle) };
  // Lying as photographed unless the photo says otherwise: identification settles the rest.
  if (down.y < -1e-6 || (Math.abs(down.y) <= 1e-6 && down.x < 0)) down = { x: -down.x, y: -down.y };
  const right = { x: down.y, y: -down.x };
  const corner = (sideways: number, lengthways: number) => hull.reduce((best, point) => {
    const score = (p: Point) => {
      const dx = p.x - box.center.x, dy = p.y - box.center.y;
      return sideways * (dx * right.x + dy * right.y) / short + lengthways * (dx * down.x + dy * down.y) / long;
    };
    return score(point) > score(best) ? point : best;
  });
  return { quad: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], long, short };
}

const isClockwise = (quad: CardQuad) => quad.every((point, i) => {
  const next = quad[(i + 1) % 4], after = quad[(i + 2) % 4];
  return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x) > 1e-6;
});

function findCards(mask: Uint8Array, width: number, height: number): { cards: Candidate[]; rejected: number } {
  const longest = Math.max(width, height);
  const minArea = (longest * MIN_LONG_SIDE) ** 2 * 0.5;
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const rowMin = new Int32Array(height), rowMax = new Int32Array(height);
  const cards: Candidate[] = [];
  let rejected = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    rowMin.fill(width); rowMax.fill(-1);
    let count = 1, touchesEdge = false;
    queue[0] = start; seen[start] = 1;
    for (let read = 0; read < count; read++) {
      const index = queue[read];
      const x = index % width, y = Math.floor(index / width);
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) touchesEdge = true;
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]) {
        if (next >= 0 && mask[next] && !seen[next]) { seen[next] = 1; queue[count++] = next; }
      }
    }
    if (count < minArea) continue;
    const outline: Point[] = [];
    for (let y = 0; y < height; y++) if (rowMax[y] >= 0) outline.push({ x: rowMin[y], y }, { x: rowMax[y], y });
    const hull = convexHull(outline);
    const box = hull.length >= 3 ? minimumBox(hull) : null;
    if (!box) continue;
    const { quad, long, short } = cardCorners(hull, box);
    const sides = quad.map((point, i) => distance(point, quad[(i + 1) % 4]));
    const fill = count / box.area;
    const ratio = short / long;
    const card = !touchesEdge && ratio >= MIN_RATIO && ratio <= MAX_RATIO && fill >= MIN_FILL &&
      long >= longest * MIN_LONG_SIDE && long <= longest * MAX_LONG_SIDE && isClockwise(quad) &&
      Math.min(sides[0], sides[2]) >= Math.max(sides[0], sides[2]) * 0.7 &&
      Math.min(sides[1], sides[3]) >= Math.max(sides[1], sides[3]) * 0.7;
    if (card) cards.push({ quad, fill, center: box.center, shortSide: short, longSide: long });
    else rejected++;
  }
  return { cards, rejected };
}

/** Rows from the top, each from the left, so the list reads like the table. */
export function readingOrder<T extends { center: Point; shortSide: number }>(cards: T[]): T[] {
  const rows: T[][] = [];
  for (const card of [...cards].sort((a, b) => a.center.y - b.center.y)) {
    const row = rows[rows.length - 1];
    if (row && card.center.y - row[0].center.y < card.shortSide * 0.7) row.push(card);
    else rows.push([card]);
  }
  return rows.flatMap(row => row.sort((a, b) => a.center.x - b.center.x));
}

export function detectTableCards(data: Uint8ClampedArray, width: number, height: number): TableDetection {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || data.length < width * height * 4) return { quads: [], rejected: 0 };
  // Bridges of a pixel or two between neighbours are cut, without eating into the cards.
  const open = (mask: Uint8Array, radius: number) => dilate(erode(mask, width, height, radius), width, height, radius);
  const radius = Math.max(1, Math.round(Math.max(width, height) / 480));
  const closed = erode(dilate(differenceMask(data, width, height), width, height, radius), width, height, radius);
  const byColour = findCards(open(fillHoles(closed, width, height), radius + 1), width, height);
  const outline = dilate(outlineMask(grayscale(data, width, height), width, height), width, height, radius);
  const byOutline = findCards(open(erode(fillHoles(outline, width, height), width, height, radius + 1), radius + 1), width, height);
  const merged: Candidate[] = [];
  for (const card of [...byColour.cards, ...byOutline.cards].sort((a, b) => b.fill - a.fill)) {
    if (!merged.some(other => distance(other.center, card.center) < Math.min(other.shortSide, card.shortSide) * 0.5)) merged.push(card);
  }
  // Two upright cards touching side by side make one card-shaped blob lying down. Only its
  // size gives it away; a pair alone on the table is left for identification to refuse.
  const areas = merged.map(card => card.longSide * card.shortSide).sort((a, b) => a - b);
  const typical = areas[Math.floor((areas.length - 1) / 2)];
  const single = merged.filter(card => card.longSide * card.shortSide <= typical * 1.7);
  // Noise only ever shows up in one reading; a real problem object shows up in both.
  return {
    quads: readingOrder(single).map(card => card.quad),
    rejected: Math.min(byColour.rejected, byOutline.rejected) + merged.length - single.length,
  };
}

/** Variance of the Laplacian: sharper photos have stronger fine detail. */
export function frameSharpness(data: Uint8ClampedArray, width: number, height: number): number {
  const gray = grayscale(data, width, height);
  let sum = 0, squares = 0, count = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const value = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
    sum += value; squares += value * value; count++;
  }
  return count ? squares / count - (sum / count) ** 2 : 0;
}

const center = (quad: CardQuad): Point => ({ x: quad.reduce((sum, point) => sum + point.x, 0) / 4, y: quad.reduce((sum, point) => sum + point.y, 0) / 4 });

/** Whether nothing has moved between two looks at the table. */
export function sameLayout(a: CardQuad[], b: CardQuad[], tolerance: number): boolean {
  return a.length === b.length && a.every(quad => {
    const point = center(quad);
    return b.some(other => distance(center(other), point) <= tolerance);
  });
}
