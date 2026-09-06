/**
 * Writes the PWA icons into public/icons.
 *
 * Run with `node scripts/generate-icons.mjs`. The output is committed, so this only needs
 * running again if the mark changes. Drawing them here rather than committing binaries
 * from nowhere keeps the icons reproducible and reviewable, and needs no image library.
 */
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));

// Matches the app's dark theme, so the splash screen does not flash a different colour.
const BACKGROUND = [11, 16, 32, 255];
const RED = [225, 74, 74, 255];
const WHITE = [246, 248, 252, 255];
const OUTLINE = [15, 20, 36, 255];

/** 4x4 supersampling: enough to keep the circle edges clean at 192px. */
const SAMPLES = 4;

/**
 * Colour of one point of the mark, in a unit square where the ball is centred.
 * `scale` is the ball's radius as a fraction of the icon; a maskable icon needs a smaller
 * one so nothing important falls outside the safe zone a launcher may crop to.
 */
const sample = (x, y, scale) => {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const distance = Math.hypot(dx, dy);

  if (distance > scale) return BACKGROUND;
  // The outer rim, the band across the middle and the ring around the button are one
  // colour, so they read as a single continuous outline.
  if (distance > scale * 0.92) return OUTLINE;
  if (Math.abs(dy) < scale * 0.09) return OUTLINE;
  if (distance < scale * 0.3) return distance < scale * 0.19 ? WHITE : OUTLINE;
  return dy < 0 ? RED : WHITE;
};

const renderPixels = (size, scale) => {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const channels = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const colour = sample(
            (px + (sx + 0.5) / SAMPLES) / size,
            (py + (sy + 0.5) / SAMPLES) / size,
            scale
          );
          for (let c = 0; c < 4; c++) channels[c] += colour[c];
        }
      }
      const offset = (py * size + px) * 4;
      const total = SAMPLES * SAMPLES;
      for (let c = 0; c < 4; c++) pixels[offset + c] = Math.round(channels[c] / total);
    }
  }
  return pixels;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
};

/** Minimal 8-bit RGBA PNG: one IHDR, one IDAT with filter byte 0 per row, one IEND. */
const encodePng = (size, pixels) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;   // bit depth
  header[9] = 6;   // colour type: RGBA
  // compression, filter and interlace methods are all 0.

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row++) {
    raw[row * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

mkdirSync(OUT_DIR, { recursive: true });

const icons = [
  { file: 'icon-192.png', size: 192, scale: 0.46 },
  { file: 'icon-512.png', size: 512, scale: 0.46 },
  // Launchers may crop a maskable icon to a circle or squircle, keeping only the middle
  // 80%; a smaller ball keeps the whole mark inside that safe zone.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.34 },
];

for (const { file, size, scale } of icons) {
  writeFileSync(OUT_DIR + file, encodePng(size, renderPixels(size, scale)));
  console.log(`wrote ${file} (${size}x${size})`);
}
