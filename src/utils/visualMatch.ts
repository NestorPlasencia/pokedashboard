import type { Card } from '../types/dashboard';
import { groupScanCards, normalizeScanText, rankScanMatches, type ScanMatch } from './cardScanner.ts';

/** One series' vectors, written by scripts/build-card-vectors.mjs. */
export type CardVectorFile = {
  version: 1;
  model: string;
  dims: number;
  images: string[];
  /** base64 Float32Array, one per image */
  scales: string;
  /** base64 Int8Array, images × dims */
  vectors: string;
};

export type CardVectorIndex = {
  model: string;
  dims: number;
  rows: Map<string, { values: Int8Array; scale: number }>;
};

/** The same slug the build script writes each series under. */
export const cardVectorFileName = (series: string) => `${series.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`;

const decode = (base64: string) => Uint8Array.from(atob(base64), character => character.charCodeAt(0)).buffer;

export function buildCardVectorIndex(files: CardVectorFile[]): CardVectorIndex | null {
  const usable = files.filter(file => file.version === 1 && file.model === files[0]?.model && file.dims === files[0]?.dims);
  if (!usable.length) return null;
  const rows = new Map<string, { values: Int8Array; scale: number }>();
  for (const file of usable) {
    const values = new Int8Array(decode(file.vectors));
    const scales = new Float32Array(decode(file.scales));
    file.images.forEach((image, row) => rows.set(image, { values: values.subarray(row * file.dims, (row + 1) * file.dims), scale: scales[row] }));
  }
  return { model: usable[0].model, dims: usable[0].dims, rows };
}

/** Cosine similarity: both sides are unit vectors. */
export function vectorSimilarity(query: Float32Array, row: { values: Int8Array; scale: number }): number {
  let sum = 0;
  for (let i = 0; i < row.values.length; i++) sum += query[i] * row.values[i];
  return sum * row.scale;
}

/** Below this the frame most likely shows no catalog card (a hand, the table). */
export const VISUAL_MIN_SIMILARITY = 0.5;
/** Same-art reprints score within a few hundredths of each other; another card scores well below. */
export const VISUAL_MARGIN = 0.08;

export type VisualMatch = {
  best: number;
  /** Cards whose art matches about as well as the best one, best first. */
  shortlist: (ScanMatch & { similarity: number })[];
  /** Other cards with a shortlisted name: reprints whose reference photo scored lower. */
  related: ScanMatch[];
  /** The one card the collector number picks out of the shortlist and its reprints, if any. */
  resolved: ScanMatch | null;
  /** Whether the collector number chose it, or one clear art was enough. */
  resolvedBy: 'number' | 'image' | null;
  /** Stable while the same card is held, even when the number is read on some frames only. */
  gateKey: string;
  /** Every key a later frame of this card can produce. */
  latchKeys: string[];
};

/** The image says which card; the collector number says which of its same-art reprints. */
export function rankVisualMatches(cards: Card[], similarityOf: (card: Card) => number | undefined, numberText: string): VisualMatch | null {
  const scored = groupScanCards(cards).flatMap(group => {
    const values = group.cards.map(similarityOf).filter((value): value is number => value !== undefined);
    return values.length ? [{ ...group, similarity: Math.max(...values) }] : [];
  }).sort((a, b) => b.similarity - a.similarity);
  const best = scored[0]?.similarity ?? 0;
  if (best < VISUAL_MIN_SIMILARITY) return null;
  const shortlist = scored.filter(group => group.similarity >= best - VISUAL_MARGIN).slice(0, 8);
  // Reference photos come from different sources, so a reprint's own photo can score far
  // lower than its twin's. Reprints share the name: the number chooses among all of them.
  const names = new Set(shortlist.map(group => normalizeScanText(group.cards[0].name)));
  const shortlisted = new Set(shortlist.map(group => group.key));
  const related = groupScanCards(cards).filter(group => !shortlisted.has(group.key) && names.has(normalizeScanText(group.cards[0].name)));
  const pool = [...shortlist, ...related];
  let resolved: ScanMatch | null = null;
  const byNumber = rankScanMatches(pool.flatMap(group => group.cards), '', numberText);
  // Number alone scores 35, number and set total 50; a tie (Base Set and Shadowless) stays open.
  if (byNumber[0] && byNumber[0].score >= 35 && !(byNumber[1] && byNumber[1].score === byNumber[0].score)) {
    resolved = pool.find(group => group.key === byNumber[0].key) ?? null;
  }
  // One clear art is enough without the number; its reprints stay available in review.
  const resolvedBy = resolved ? 'number' : shortlist.length === 1 ? 'image' : null;
  if (!resolved && shortlist.length === 1) resolved = shortlist[0];
  const keys = pool.map(group => group.key);
  return {
    best, shortlist, related, resolved, resolvedBy,
    gateKey: resolved?.key ?? `art:${shortlist.map(group => group.key).sort()[0]}`,
    latchKeys: keys.flatMap(key => [key, `art:${key}`]),
  };
}
