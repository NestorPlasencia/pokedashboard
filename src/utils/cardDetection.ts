export type ImagePoint = { x: number; y: number };
export type CardQuad = [ImagePoint, ImagePoint, ImagePoint, ImagePoint];

const distance = (a: ImagePoint, b: ImagePoint) => Math.hypot(a.x - b.x, a.y - b.y);

function isConvexQuad(quad: CardQuad): boolean {
  if (quad.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  // Clockwise in canvas coordinates. Collapsed or crossing sides cannot be warped safely.
  return quad.every((point, i) => {
    const next = quad[(i + 1) % 4], after = quad[(i + 2) % 4];
    const cross = (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
    return cross > 1e-6;
  });
}

function hasBorderSupport(quad: CardQuad, labels: Int32Array, label: number, width: number, height: number): boolean {
  // Rounded corners and a few glare pixels are expected, but every side must exist.
  const radius = Math.max(2, Math.ceil(Math.min(...quad.map((point, i) => distance(point, quad[(i + 1) % 4]))) * 0.025));
  return quad.every((point, i) => {
    const next = quad[(i + 1) % 4];
    let supported = 0;
    for (let sample = 0; sample < 20; sample++) {
      const t = 0.08 + sample * 0.84 / 19;
      const x = Math.round(point.x + (next.x - point.x) * t);
      const y = Math.round(point.y + (next.y - point.y) * t);
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) for (let dx = -radius; dx <= radius; dx++) {
        const sx = x + dx, sy = y + dy;
        if (sx >= 0 && sx < width && sy >= 0 && sy < height && labels[sy * width + sx] === label) {
          found = true;
          break;
        }
      }
      if (found) supported++;
    }
    return supported >= 16;
  });
}

/** Find a connected yellow border, rather than assuming the guide is filled.
 * Work on a small preview; camera pixels are retained for the OCR crop.
 */
export function detectCardBorder(data: Uint8ClampedArray, width: number, height: number): CardQuad | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || data.length < width * height * 4) return null;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    mask[i] = r >= 125 && g >= 105 && g > b * 1.45 && r >= g * 0.9 && r < g * 1.55 && (r - b) / r > 0.43 ? 1 : 0;
  }
  const queue = new Int32Array(mask.length);
  const labels = new Int32Array(mask.length);
  let best: CardQuad | null = null;
  let bestScore = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let read = 0, count = 1;
    const label = start + 1;
    queue[0] = start; mask[start] = 0; labels[start] = label;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let tl = { x: width, y: height }, tr = { x: 0, y: height }, br = { x: 0, y: 0 }, bl = { x: width, y: 0 };
    while (read < count) {
      const index = queue[read++];
      const x = index % width, y = Math.floor(index / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x + y < tl.x + tl.y) tl = { x, y };
      if (x - y > tr.x - tr.y) tr = { x, y };
      if (x + y > br.x + br.y) br = { x, y };
      if (x - y < bl.x - bl.y) bl = { x, y };
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next]) { mask[next] = 0; labels[next] = label; queue[count++] = next; }
      }
    }
    const boxWidth = maxX - minX, boxHeight = maxY - minY;
    if (boxWidth < width * 0.23 || boxHeight < height * 0.3 || count < 100) continue;
    const horizontal = (distance(tl, tr) + distance(bl, br)) / 2;
    const vertical = (distance(tl, bl) + distance(tr, br)) / 2;
    const ratio = horizontal / vertical;
    const fill = count / Math.max(1, boxWidth * boxHeight);
    if (ratio < 0.5 || ratio > 0.9 || fill < 0.025 || fill > 0.72) continue;
    // Reject collapsed corners and thin yellow objects that only resemble a card's box.
    if (Math.min(distance(tl, tr), distance(bl, br)) < horizontal * 0.65 ||
      Math.min(distance(tl, bl), distance(tr, br)) < vertical * 0.65) continue;
    const quad: CardQuad = [tl, tr, br, bl];
    if (!isConvexQuad(quad) || !hasBorderSupport(quad, labels, label, width, height)) continue;
    const score = horizontal * vertical * (1 - Math.abs(ratio - 63 / 88));
    if (score > bestScore) { best = quad; bestScore = score; }
  }
  return best;
}

/** Map the unit rectangle into the photographed quadrilateral (projective warp). */
export function cardProjection([p0, p1, p2, p3]: CardQuad) {
  if (!isConvexQuad([p0, p1, p2, p3])) throw new RangeError('Card corners must form a convex, clockwise quadrilateral');
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g = Math.abs(denominator) < 1e-6 ? 0 : (dx3 * dy2 - dx2 * dy3) / denominator;
  const h = Math.abs(denominator) < 1e-6 ? 0 : (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y;
  return (u: number, v: number): ImagePoint => {
    const scale = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / scale, y: (d * u + e * v + p0.y) / scale };
  };
}

export type LocatedCard = { canvas: HTMLCanvasElement; detected: boolean };

export function locateAndCropCard(image: HTMLCanvasElement): LocatedCard {
  if (image.width < 2 || image.height < 2) return { canvas: image, detected: false };
  const preview = document.createElement('canvas');
  preview.width = Math.min(360, image.width);
  preview.height = Math.round(image.height * preview.width / image.width);
  const previewContext = preview.getContext('2d', { willReadFrequently: true });
  if (!previewContext) throw new Error('Canvas unavailable');
  previewContext.drawImage(image, 0, 0, preview.width, preview.height);
  const quad = detectCardBorder(previewContext.getImageData(0, 0, preview.width, preview.height).data, preview.width, preview.height);
  if (!quad) return { canvas: image, detected: false };
  const scaled = quad.map(point => ({ x: point.x * image.width / preview.width, y: point.y * image.height / preview.height })) as CardQuad;
  const project = cardProjection(scaled);
  const source = image.getContext('2d', { willReadFrequently: true })?.getImageData(0, 0, image.width, image.height);
  if (!source) throw new Error('Canvas unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = Math.round(900 * 88 / 63);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  const result = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const point = project(x / (canvas.width - 1), y / (canvas.height - 1));
    const sx = Math.max(0, Math.min(image.width - 1, point.x));
    const sy = Math.max(0, Math.min(image.height - 1, point.y));
    const ix = Math.min(image.width - 2, Math.floor(sx)), iy = Math.min(image.height - 2, Math.floor(sy));
    const fx = sx - ix, fy = sy - iy;
    const index = (y * canvas.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const top = source.data[(iy * image.width + ix) * 4 + channel] * (1 - fx) + source.data[(iy * image.width + ix + 1) * 4 + channel] * fx;
      const bottom = source.data[((iy + 1) * image.width + ix) * 4 + channel] * (1 - fx) + source.data[((iy + 1) * image.width + ix + 1) * 4 + channel] * fx;
      result.data[index + channel] = top * (1 - fy) + bottom * fy;
    }
    result.data[index + 3] = 255;
  }
  context.putImageData(result, 0, 0);
  return { canvas, detected: true };
}
