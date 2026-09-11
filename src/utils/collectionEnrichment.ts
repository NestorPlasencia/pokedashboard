import type { Card } from '../types/dashboard';

/**
 * Matching a copy - a product in a printing - to the catalog card it stands for.
 *
 * A product id names the card but not the printing: one product can exist as several
 * catalog cards, Normal and Reverse Holo among them. The printing recorded with the copy
 * picks one when it matches exactly; otherwise reverse versus not-reverse is the best
 * signal left, taken from the printing or, when there is none, from a hint such as the
 * collection's name.
 */
export const findPrintingMatch = (
  candidates: Card[],
  printing: string | null | undefined,
  hint = ''
): Card | undefined => {
  if (candidates.length === 0) return undefined;
  const wanted = printing?.trim().toLowerCase();
  const exact = wanted
    ? candidates.find((card) =>
        [card.printing, card.variant].filter(Boolean).some((value) => value!.toLowerCase() === wanted)
      )
    : undefined;
  if (exact) return exact;
  const wantsReverse = wanted ? wanted.includes('reverse') : hint.toLowerCase().includes('reverse');
  const preferred = wantsReverse
    ? candidates.find((card) => card.variant === 'Reverse Holo')
    : candidates.find((card) => card.variant !== 'Reverse Holo');
  return preferred ?? candidates[0];
};

/**
 * Replaces each collection card built from its Supabase row with the catalog card it
 * stands for, once that product's series has loaded - bringing prices, the image and the
 * real series, set and rarity the filters work on.
 *
 * The copy stays itself: it keeps its own id, so the list does not reshuffle as matches
 * arrive, the printing it was recorded with, and its collection membership. A card whose
 * product has not been found yet is returned untouched.
 */
export const enrichCollectionCards = (
  cards: Card[],
  catalogByProduct: ReadonlyMap<number, Card[]>,
  collectionName = ''
): Card[] => {
  if (catalogByProduct.size === 0) return cards;
  return cards.map((card) => {
    const candidates = card.productId ? catalogByProduct.get(card.productId) : undefined;
    const match = candidates && findPrintingMatch(candidates, card.printing, collectionName);
    if (!match) return card;
    return {
      ...match,
      id: card.id,
      printing: card.printing ?? match.printing,
      image: match.image || card.image,
      collections: card.collections,
    };
  });
};
