import { defaultDraftCardId, type ScanDraft } from '../utils/cardScanner.ts';

export const scannerReviewKey = (userId: string) => `pokedashboard.scanner-review.v1:${userId || 'guest'}`;
const conditions = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];

export function readScannerReview(storage: Pick<Storage, 'getItem'>, userId: string): ScanDraft[] {
  const raw = storage.getItem(scannerReviewKey(userId));
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(entry => entry && typeof entry.id === 'string' &&
    typeof entry.cardId === 'string' && typeof entry.collectionId === 'string' && typeof entry.approved === 'boolean' &&
    typeof entry.note === 'string' && typeof entry.createdAt === 'string' &&
    (entry.extraCopyIds === undefined || (Array.isArray(entry.extraCopyIds) && entry.extraCopyIds.every((id: unknown) => typeof id === 'string'))) && conditions.includes(entry.condition) &&
    Array.isArray(entry.candidates) && entry.candidates.length > 0 && entry.candidates.every((card: { id?: unknown; name?: unknown; setName?: unknown; number?: unknown; variant?: unknown; image?: unknown }) =>
      card && typeof card.id === 'string' && typeof card.name === 'string' && typeof card.setName === 'string' &&
      typeof card.number === 'string' && typeof card.variant === 'string' && typeof card.image === 'string'))) {
    throw new Error('Invalid scanner review data');
  }
  // Restoring never counts as user review/approval in a new session.
  return (value as ScanDraft[]).map(entry => ({ ...entry, cardId: defaultDraftCardId(entry.candidates, entry.cardId), approved: false }));
}

export function saveScannerReview(storage: Pick<Storage, 'setItem'>, userId: string, entries: ScanDraft[]) {
  storage.setItem(scannerReviewKey(userId), JSON.stringify(entries));
}
