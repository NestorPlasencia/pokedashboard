import type { PublicCollectionCard } from '../services/publicCollection';
import { DEFAULT_RARITIES_ORDER } from '../constants/constants.ts';

export const PUBLIC_COLLECTION_FACETS = [
  { key: 'set_name' }, { key: 'rarity' }, { key: 'printing' }, { key: 'condition' }, { key: 'language' },
] as const;
export type PublicCollectionFacet = typeof PUBLIC_COLLECTION_FACETS[number]['key'];
type Facet = PublicCollectionFacet;
export type PublicCollectionFilters = Record<Facet, string>;
export const EMPTY_PUBLIC_COLLECTION_FILTERS: PublicCollectionFilters = {
  set_name: '', rarity: '', printing: '', condition: '', language: '',
};
export const PUBLIC_COLLECTION_ORDERS = [
  { value: 'name-asc' }, { value: 'name-desc' }, { value: 'pokedex' }, { value: 'set-number' }, { value: 'rarity' }, { value: 'price-asc' }, { value: 'price-desc' },
] as const;
export type PublicCollectionOrder = typeof PUBLIC_COLLECTION_ORDERS[number]['value'];

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Empty, missing and real values have distinct option IDs, even if a stored label
// happens to read "all" or "missing".
const facetId = (value: string | null) => value?.trim() ? `value:${value.trim()}` : 'missing';
const rarityRank = (value: string | null) => {
  const index = DEFAULT_RARITIES_ORDER.indexOf(value ?? '');
  return index === -1 ? DEFAULT_RARITIES_ORDER.length : index;
};
const compareOptional = (a: string | null, b: string | null, direction = 1) => {
  if (!a?.trim()) return b?.trim() ? 1 : 0;
  if (!b?.trim()) return -1;
  return direction * collator.compare(a, b);
};

export function publicCollectionFilterOptions(cards: PublicCollectionCard[], printingOrder: readonly string[], missingLabel = 'Not specified') {
  return Object.fromEntries(PUBLIC_COLLECTION_FACETS.map(({ key }) => {
    const values = new Map(cards.map(card => [facetId(card[key]), card[key]?.trim() || missingLabel]));
    const options = [...values].map(([value, label]) => ({ value, label }));
    options.sort((a, b) => {
      if (a.value === 'missing') return b.value === 'missing' ? 0 : 1;
      if (b.value === 'missing') return -1;
      if (key === 'printing') {
        const rank = (label: string) => {
          const index = printingOrder.indexOf(label);
          return index === -1 ? printingOrder.length : index;
        };
        return rank(a.label) - rank(b.label) || collator.compare(a.label, b.label);
      }
      if (key === 'rarity') return rarityRank(a.label) - rarityRank(b.label) || collator.compare(a.label, b.label);
      return collator.compare(a.label, b.label);
    });
    return [key, options];
  })) as Record<Facet, { value: string; label: string }[]>;
}

/** All exploration stays inside the already-public RPC result. */
export function publicCollectionResults(
  cards: PublicCollectionCard[], search: string, filters: PublicCollectionFilters, order: PublicCollectionOrder,
  prices: ReadonlyMap<PublicCollectionCard, number> = new Map(),
  pokedex: ReadonlyMap<PublicCollectionCard, number> = new Map(),
) {
  const words = normalize(search).trim().split(/\s+/).filter(Boolean);
  const result = cards.filter(card => {
    if (PUBLIC_COLLECTION_FACETS.some(({ key }) => filters[key] && filters[key] !== facetId(card[key]))) return false;
    const text = normalize([card.name, card.set_name, card.number, card.number && `#${card.number}`,
      card.rarity, card.printing, card.condition, card.language].filter(Boolean).join(' '));
    return words.every(word => text.includes(word));
  });
  const tieBreak = (a: PublicCollectionCard, b: PublicCollectionCard) =>
    collator.compare(a.name, b.name) || compareOptional(a.set_name, b.set_name)
    || compareOptional(a.number, b.number) || a.product_id - b.product_id;
  return result.sort((a, b) => {
    let comparison = 0;
    switch (order) {
      case 'name-asc': comparison = collator.compare(a.name, b.name); break;
      case 'name-desc': comparison = collator.compare(b.name, a.name); break;
      case 'pokedex': {
        // Trainers and Energy have no Pokédex number and follow every Pokémon.
        const left = pokedex.get(a), right = pokedex.get(b);
        if (left === undefined) return right === undefined ? tieBreak(a, b) : 1;
        if (right === undefined) return -1;
        comparison = left - right;
        break;
      }
      case 'set-number': comparison = compareOptional(a.set_name, b.set_name) || compareOptional(a.number, b.number); break;
      case 'rarity': comparison = rarityRank(a.rarity) - rarityRank(b.rarity) || compareOptional(a.rarity, b.rarity); break;
      case 'price-asc':
      case 'price-desc': {
        const left = prices.get(a), right = prices.get(b);
        if (left === undefined) return right === undefined ? tieBreak(a, b) : 1;
        if (right === undefined) return -1;
        comparison = order === 'price-asc' ? left - right : right - left;
        break;
      }
    }
    return comparison || tieBreak(a, b);
  });
}
