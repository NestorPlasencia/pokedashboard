import type { InventoryEntry } from '../services/inventory';
import type { Card, OptionsCollection, QuantityKey } from '../types/dashboard';
import { clearScanMatch, proposedScanCard, rankScanMatches, type ScanMatch } from './cardScanner.ts';
import { findPrintingMatch } from './collectionEnrichment.ts';
import { CONDITION_ABBREVIATIONS, getBestAvailablePrice } from './collectionValue.ts';
import { CONDITION_ORDER, countCopies } from './copyCount.ts';
import { money } from './reportDisplay.ts';
import type { VisualMatch } from './visualMatch.ts';

/**
 * Check mode: is the scanned card in this collection, and is it worth more than a limit?
 * Nothing here writes; the answer comes from the inventory snapshot alone.
 *
 * The camera identifies a card by set, number and name. It cannot read a 1st Edition stamp,
 * so an answer covers every selected printing of that card and lists which ones the copies
 * are; filtering the catalog to one variant is how to ask about just that one.
 * Only a closed list of possible cards can give a firm answer: if they all agree, it does
 * not matter which one is in the camera; if they differ, they are shown instead.
 */
export type CheckPrinting = {
  printing: string;
  copies: number;
  conditions: { condition: QuantityKey; copies: number }[];
};

export type CheckCandidate = {
  key: string;
  card: Card;
  /** A card without a product id cannot be in a collection, so its absence says nothing. */
  tracked: boolean;
  copies: number;
  printings: CheckPrinting[];
  /** The catalog has several printings of it that the camera cannot tell apart. */
  mixedPrintings: boolean;
};

export type CheckResult = {
  verdict: 'held' | 'absent' | 'unclear';
  /** Most likely first. */
  candidates: CheckCandidate[];
};

export type PriceAlert = {
  /** `over`: every possible card exceeds the limit. `maybe`: only some do. */
  level: 'over' | 'maybe' | 'unpriced';
  price: number | null;
  /** Which printing or set that price belongs to, when others are possible. */
  where: string;
};

const HELD_ORDER: QuantityKey[] = [...CONDITION_ORDER, 'Unknown'];

const isTracked = (card: Card) => Number.isInteger(card.productId) && (card.productId ?? 0) > 0;

const printingLabel = (card: Card) => card.variant || card.printing || '';

/**
 * The printings the camera can mistake for one another. A card's number also covers rarities
 * such as Jumbo, Metal or a store stamp, which are easy to tell by hand and can cost far more.
 */
const mainPrintings = (cards: Card[]) => {
  const main = cards.filter(card => !card.cardVariantTopLevel || /^(Standard|Parallel|1st Edition)/.test(card.cardVariantTopLevel));
  return main.length ? main : cards;
};

/** Every catalog card by its product, the same grouping collections match their copies with. */
export function cardsByProduct(cards: Card[]): Map<number, Card[]> {
  const products = new Map<number, Card[]>();
  for (const card of cards) {
    if (isTracked(card)) products.set(card.productId as number, [...(products.get(card.productId as number) ?? []), card]);
  }
  return products;
}

/**
 * The catalog card a copy stands for, by the same rule the collections use. One product can
 * hold several printings, so it is looked up among all of them, not just the selected ones.
 * With no printing recorded and several possible, there is no telling which.
 */
const copyCard = (candidates: Card[], printing: string | null | undefined) => {
  const known = printing?.trim();
  return known ? findPrintingMatch(candidates, known) : candidates.length === 1 ? candidates[0] : undefined;
};

/**
 * The copies of these catalog cards held in the collections in scope, by printing. A copy of
 * a printing the selection left out is not one of them, even when it shares the product.
 */
export function collectionCopies(cards: Card[], entriesByProductId: ReadonlyMap<number, InventoryEntry[]>, scope: ReadonlySet<string>, catalogByProduct: ReadonlyMap<number, Card[]> = new Map()): CheckPrinting[] {
  const counts = new Map<string, Partial<Record<QuantityKey, number>>>();
  const selected = new Set(cards.map(card => card.id));
  for (const productId of new Set(cards.filter(isTracked).map(card => card.productId as number))) {
    const candidates = catalogByProduct.get(productId) ?? cards.filter(card => card.productId === productId);
    for (const entry of entriesByProductId.get(productId) ?? []) {
      if (!scope.has(entry.collectionName)) continue;
      const stands = copyCard(candidates, entry.printing);
      if (stands && !selected.has(stands.id)) continue;
      const printing = (stands && printingLabel(stands)) || entry.printing?.trim() || 'Sin impresión';
      const quantity = counts.get(printing) ?? {};
      for (const [condition, copies] of Object.entries(entry.conditions) as [QuantityKey, number | undefined][]) {
        quantity[condition] = (quantity[condition] ?? 0) + (copies ?? 0);
      }
      counts.set(printing, quantity);
    }
  }
  return [...counts].map(([printing, quantity]) => ({
    printing,
    copies: countCopies(quantity),
    conditions: HELD_ORDER.filter(condition => (quantity[condition] ?? 0) > 0).map(condition => ({ condition, copies: quantity[condition] as number })),
  })).filter(entry => entry.copies > 0).sort((a, b) => b.copies - a.copies || a.printing.localeCompare(b.printing));
}

/**
 * `openEnded` marks a list that may leave the real card out (a doubtful OCR read), which can
 * only be shown, never answered from.
 */
export function checkScan(groups: ScanMatch[], entriesByProductId: ReadonlyMap<number, InventoryEntry[]>, scope: ReadonlySet<string>,
  { openEnded = false, catalogByProduct }: { openEnded?: boolean; catalogByProduct?: ReadonlyMap<number, Card[]> } = {}): CheckResult {
  const candidates = groups.map((group): CheckCandidate => {
    const printings = collectionCopies(group.cards, entriesByProductId, scope, catalogByProduct);
    const main = mainPrintings(group.cards);
    return {
      key: group.key,
      card: proposedScanCard(main) ?? main[0],
      tracked: group.cards.some(isTracked),
      copies: printings.reduce((sum, entry) => sum + entry.copies, 0),
      printings,
      mixedPrintings: new Set(main.map(printingLabel)).size > 1,
    };
  });
  const settled = !openEnded && candidates.length > 0;
  if (settled && candidates.every(candidate => candidate.copies > 0)) return { verdict: 'held', candidates };
  if (settled && candidates.every(candidate => candidate.tracked && candidate.copies === 0)) return { verdict: 'absent', candidates };
  return { verdict: 'unclear', candidates };
}

/**
 * The cards an image match could be. Only the collector number settles a card: without it a
 * reprint with another reference photo is still possible, so every reprint stays listed.
 */
export function visualCheckCandidates(visual: VisualMatch, numberText: string): ScanMatch[] {
  if (visual.resolvedBy === 'number' && visual.resolved) return [visual.resolved];
  const pool = [...new Map([...(visual.resolved ? [visual.resolved] : []), ...visual.shortlist, ...visual.related].map(group => [group.key, group])).values()];
  // Two sets can share a number (Base Set and Shadowless); it still rules out the others.
  const byNumber = rankScanMatches(pool.flatMap(group => group.cards), '', numberText);
  const tied = new Set(byNumber.filter(match => match.score >= 35 && match.score === byNumber[0].score).map(match => match.key));
  return tied.size ? pool.filter(group => tied.has(group.key)) : pool;
}

/**
 * The cards an OCR read could be. Name and number read exactly close the list, even if two
 * sets tie on them; anything fuzzier is only a list of guesses.
 */
export function ocrCheckCandidates(matches: ScanMatch[]): { groups: ScanMatch[]; openEnded: boolean } {
  const near = matches.filter(match => matches[0].score - match.score < 15);
  return near.every(match => clearScanMatch([match])) ? { groups: near, openEnded: false } : { groups: matches.slice(0, 6), openEnded: true };
}

/**
 * Compares the catalog price (Near Mint, or the best one available: the camera cannot judge
 * condition) with the limit. A card that might exceed it still alerts, because missing an
 * expensive 1st Edition is worse than a second look at an Unlimited one. Rarities stay out,
 * or one store stamp would alert on every copy of an ordinary card.
 */
export function checkPriceAlert(groups: ScanMatch[], limit: number | null): PriceAlert | null {
  if (limit === null) return null;
  const printings = groups.flatMap(group => mainPrintings(group.cards).map(card => ({ card, price: getBestAvailablePrice(card) })));
  const priced = printings.flatMap(entry => entry.price === null ? [] : [{ card: entry.card, price: entry.price }]);
  const over = priced.filter(entry => entry.price > limit).sort((a, b) => b.price - a.price);
  if (!over.length) return priced.length === printings.length ? null : { level: 'unpriced', price: null, where: '' };
  const prices = new Set(printings.map(entry => entry.price));
  const certain = over.length === printings.length;
  const label = groups.length > 1 ? `${over[0].card.setName} · ${printingLabel(over[0].card)}` : printingLabel(over[0].card);
  return { level: certain ? 'over' : 'maybe', price: over[0].price, where: certain && prices.size === 1 ? '' : label };
}

export const priceAlertText = (alert: PriceAlert, limit: number) => {
  if (alert.level === 'unpriced') return `Sin precio para comparar con ${money(limit)}`;
  const price = `${money(alert.price as number)}${alert.where ? ` · ${alert.where}` : ''}`;
  return `${alert.level === 'over' ? 'Supera' : 'Podría superar'} ${money(limit)}: ${price}`;
};

/** A copy synced from Collectr has no condition, so the unlabelled bucket needs its own name. */
export const conditionCountsText = (entry: CheckPrinting) => entry.conditions
  .map(({ condition, copies }) => `${CONDITION_ABBREVIATIONS[condition] || 'Sin estado'} ${copies}`).join(' · ');

const copiesText = (copies: number) => `${copies} ${copies === 1 ? 'copia' : 'copias'}`;

export function checkStatusText(result: CheckResult, collection: string): string {
  const [first] = result.candidates;
  if (result.verdict === 'held') {
    return result.candidates.length > 1
      ? `Las ${result.candidates.length} cartas posibles están en ${collection}. Pasa la siguiente carta.`
      : `${first.card.name}: sí está en ${collection} (${copiesText(first.copies)}). Pasa la siguiente carta.`;
  }
  if (result.verdict === 'absent') {
    return result.candidates.length > 1
      ? `Ninguna de las ${result.candidates.length} cartas posibles está en ${collection}. Pasa la siguiente carta.`
      : `${first.card.name}: no está en ${collection}. Pasa la siguiente carta.`;
  }
  return `${first.card.name}: lectura dudosa. Revisa el número y el set de la carta para decidir.`;
}

/** Blank is no limit; anything else unreadable is NaN, so it is corrected rather than ignored. */
export function parsePriceLimit(text: string): number | null {
  const value = text.trim().replace(/^\$\s*/, '');
  if (!value) return null;
  return /^\d+(?:[.,]\d+)?$/.test(value) ? Number(value.replace(',', '.')) : NaN;
}

export type CheckCollectionOption = { name: string; label: string };

/** Every collection the user can see, by where it comes from, each with its full path. */
export function checkCollectionGroups(collections: OptionsCollection[]): { label: string; options: CheckCollectionOption[] }[] {
  const byId = new Map(collections.filter(collection => collection.id).map(collection => [collection.id, collection]));
  const parents = new Set(collections.flatMap(collection => collection.parentId ? [collection.parentId] : []));
  const path = (collection: OptionsCollection) => {
    const names = [collection.name];
    const seen = new Set([collection.id]);
    for (let parent = byId.get(collection.parentId ?? ''); parent && !seen.has(parent.id); parent = byId.get(parent.parentId ?? '')) {
      seen.add(parent.id);
      names.unshift(parent.name);
    }
    return names.join(' › ');
  };
  const group = (label: string, belongs: (collection: OptionsCollection) => boolean) => ({
    label,
    options: collections.filter(belongs)
      .map(collection => ({ collection, path: path(collection) }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(({ collection, path }) => ({ name: collection.name, label: `${path}${parents.has(collection.id) ? ' (con subcolecciones)' : ''}` })),
  });
  return [
    group('Propias', collection => collection.kind !== 'wishlist' && collection.origin === 'app'),
    group('Collectr', collection => collection.kind !== 'wishlist' && collection.origin === 'collectr'),
    group('Listas de deseos', collection => collection.kind === 'wishlist'),
  ].filter(entry => entry.options.length > 0);
}

const SETTINGS_KEY = 'pokedashboard.scanner-check';

/** Remembered on this device, so a trip to the catalog does not lose them. */
export type ScannerCheckSettings = { checking: boolean; collection: string; limit: string };

export const DEFAULT_CHECK_SETTINGS: ScannerCheckSettings = { checking: false, collection: '', limit: '' };

export function readCheckSettings(storage: Pick<Storage, 'getItem'>): ScannerCheckSettings {
  try {
    const value: Partial<ScannerCheckSettings> | null = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null');
    return {
      checking: value?.checking === true,
      collection: typeof value?.collection === 'string' ? value.collection : '',
      limit: typeof value?.limit === 'string' ? value.limit : '',
    };
  } catch { return DEFAULT_CHECK_SETTINGS; }
}

export function saveCheckSettings(storage: Pick<Storage, 'setItem'>, settings: ScannerCheckSettings) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
