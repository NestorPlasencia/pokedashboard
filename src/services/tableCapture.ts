import { cardProjection, type CardQuad } from '../utils/cardDetection';
import { frameSharpness } from '../utils/tableDetection';

/** Detection needs the shapes, not the detail, so it runs on a smaller copy of the photo. */
const CARD_WIDTH = 900;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 88 / 63);

const newCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
};

const contextOf = (canvas: HTMLCanvasElement, frequent = false) => {
  const context = canvas.getContext('2d', { willReadFrequently: frequent });
  if (!context) throw new Error('Canvas unavailable');
  return context;
};

export function shrunkPixels(source: HTMLCanvasElement | HTMLVideoElement, sourceWidth: number, sourceHeight: number, longSide: number) {
  const scale = Math.min(1, longSide / Math.max(sourceWidth, sourceHeight));
  const canvas = newCanvas(Math.round(sourceWidth * scale), Math.round(sourceHeight * scale));
  const context = contextOf(canvas, true);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height, scale };
}

const grabFrame = (video: HTMLVideoElement) => {
  const canvas = newCanvas(video.videoWidth, video.videoHeight);
  contextOf(canvas).drawImage(video, 0, 0);
  return canvas;
};

/** Several frames a moment apart, keeping the one the hand and the focus shook the least. */
export async function sharpestFrame(video: HTMLVideoElement, frames = 4, spacing = 160): Promise<HTMLCanvasElement> {
  let best: HTMLCanvasElement | null = null;
  let bestScore = -1;
  for (let frame = 0; frame < frames; frame++) {
    if (frame) await new Promise(resolve => window.setTimeout(resolve, spacing));
    const canvas = grabFrame(video);
    const { data, width, height } = shrunkPixels(canvas, canvas.width, canvas.height, 960);
    const score = frameSharpness(data, width, height);
    if (score > bestScore) { best = canvas; bestScore = score; }
  }
  return best as HTMLCanvasElement;
}

/** A chosen photo, turned the way the phone held it. */
export async function photoFromFile(file: File, longSide = 4096): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const canvas = newCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  contextOf(canvas).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export const photoPixels = (photo: HTMLCanvasElement) => contextOf(photo, true).getImageData(0, 0, photo.width, photo.height);

/** One card straightened out of the photo of the table. */
export function straightenCard(source: ImageData, quad: CardQuad): HTMLCanvasElement {
  const project = cardProjection(quad);
  const canvas = newCanvas(CARD_WIDTH, CARD_HEIGHT);
  const context = contextOf(canvas);
  const result = context.createImageData(CARD_WIDTH, CARD_HEIGHT);
  const { width, height, data } = source;
  for (let y = 0; y < CARD_HEIGHT; y++) for (let x = 0; x < CARD_WIDTH; x++) {
    const point = project(x / (CARD_WIDTH - 1), y / (CARD_HEIGHT - 1));
    const sx = Math.max(0, Math.min(width - 1, point.x)), sy = Math.max(0, Math.min(height - 1, point.y));
    const ix = Math.min(width - 2, Math.floor(sx)), iy = Math.min(height - 2, Math.floor(sy));
    const fx = sx - ix, fy = sy - iy;
    const index = (y * CARD_WIDTH + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const top = data[(iy * width + ix) * 4 + channel] * (1 - fx) + data[(iy * width + ix + 1) * 4 + channel] * fx;
      const bottom = data[((iy + 1) * width + ix) * 4 + channel] * (1 - fx) + data[((iy + 1) * width + ix + 1) * 4 + channel] * fx;
      result.data[index + channel] = top * (1 - fy) + bottom * fy;
    }
    result.data[index + 3] = 255;
  }
  context.putImageData(result, 0, 0);
  return canvas;
}

export function upsideDown(card: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = newCanvas(card.width, card.height);
  const context = contextOf(canvas);
  context.translate(card.width, card.height);
  context.rotate(Math.PI);
  context.drawImage(card, 0, 0);
  return canvas;
}

export function pictureOf(source: HTMLCanvasElement, width: number): string {
  const canvas = newCanvas(width, Math.round(source.height * width / source.width));
  contextOf(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}
