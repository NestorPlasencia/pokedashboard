import type { ConditionKey } from '../types/dashboard';
import type { InventoryEntry, InventorySnapshot } from './inventory';

/**
 * Collections you keep yourself, for cards bought outside Collectr.
 *
 * Collectr's own collections arrive through `card_copies` and are rebuilt by every import,
 * so nothing here writes to them. These live in their own document and are *merged into
 * the inventory snapshot* instead - which is what makes them behave like any other
 * collection downstream: the collection filter, the "View" mode, the owned counters, the
 * Missing badge and the print output all read the snapshot and need no special case.
 */

/** Every copy added by hand is recorded as Near Mint; there is no condition picker yet. */
export const DEFAULT_CONDITION: ConditionKey = 'Near Mint';

export const storageKey = 'pokedashboard.owned-collections.v1';

/**
 * A card is either in the collection or it is not - there is no copy count. Cards are
 * added one by one from the catalog, so a number would only ever be 1, and the control
 * that set it would be a stepper nobody needs.
 */
export type OwnedCard = {
  productId: number;
  /** The card's variant, so Normal and Reverse Holo of one product stay separate rows. */
  printing: string;
  /** Kept alongside the id so a saved card can be described before its series loads. */
  name: string;
  setName: string;
};

export type OwnedCollection = { id: string; name: string; cards: OwnedCard[] };

/** Identifies a row within a collection: one product in one printing. */
export const ownedCardKey = (card: Pick<OwnedCard, 'productId' | 'printing'>) =>
  JSON.stringify([card.productId, card.printing]);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/**
 * Rebuilds the collections from stored JSON, dropping anything malformed rather than
 * throwing: a single bad row must not cost the user the rest of the document.
 */
export function parseOwnedCollections(data: unknown): OwnedCollection[] {
  if (!Array.isArray(data)) return [];
  const seenIds = new Set<string>();
  return data.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { id, name, cards } = entry as Partial<OwnedCollection>;
    if (typeof id !== 'string' || !id || seenIds.has(id)) return [];
    if (typeof name !== 'string' || !name.trim()) return [];
    seenIds.add(id);

    const seenCards = new Set<string>();
    const parsedCards = (Array.isArray(cards) ? cards : []).flatMap((card) => {
      if (!card || typeof card !== 'object') return [];
      const { productId, printing, name: cardName, setName } = card as Partial<OwnedCard>;
      if (!isPositiveInteger(productId)) return [];
      // Documents written before copy counts were dropped carry a `quantity`; it is
      // ignored, so any number of copies collapses to "owned".
      const row: OwnedCard = {
        productId,
        printing: typeof printing === 'string' ? printing : '',
        name: typeof cardName === 'string' ? cardName : '',
        setName: typeof setName === 'string' ? setName : '',
      };
      const key = ownedCardKey(row);
      if (seenCards.has(key)) return [];
      seenCards.add(key);
      return [row];
    });

    return [{ id, name: name.trim(), cards: parsedCards }];
  });
}

/** Puts the card in the collection. Adding one that is already there changes nothing. */
export function addOwnedCard(
  collections: OwnedCollection[],
  collectionId: string,
  card: OwnedCard
): OwnedCollection[] {
  if (!isPositiveInteger(card.productId)) return collections;
  const key = ownedCardKey(card);
  return collections.map((collection) =>
    collection.id !== collectionId || collection.cards.some((row) => ownedCardKey(row) === key)
      ? collection
      : { ...collection, cards: [...collection.cards, card] }
  );
}

/** Takes the card back out. Removing one that is not there changes nothing. */
export function removeOwnedCard(
  collections: OwnedCollection[],
  collectionId: string,
  card: Pick<OwnedCard, 'productId' | 'printing'>
): OwnedCollection[] {
  const key = ownedCardKey(card);
  return collections.map((collection) =>
    collection.id !== collectionId
      ? collection
      : { ...collection, cards: collection.cards.filter((row) => ownedCardKey(row) !== key) }
  );
}

export function createOwnedCollection(
  collections: OwnedCollection[],
  name: string,
  id: string
): OwnedCollection[] | null {
  const trimmed = name.trim();
  // Names address collections everywhere downstream - in the filter, in the URL - so two
  // with the same name would be indistinguishable once merged into the inventory.
  if (!trimmed || collections.some((collection) => collection.name === trimmed)) return null;
  return [...collections, { id, name: trimmed, cards: [] }];
}

export const deleteOwnedCollection = (collections: OwnedCollection[], id: string) =>
  collections.filter((collection) => collection.id !== id);

/** Whether the collection holds this product in this printing. */
export function ownsCard(
  collection: OwnedCollection | undefined,
  card: Pick<OwnedCard, 'productId' | 'printing'>
): boolean {
  if (!collection) return false;
  const key = ownedCardKey(card);
  return collection.cards.some((row) => ownedCardKey(row) === key);
}

const emptySnapshot = (): InventorySnapshot => ({
  collectionNames: [],
  entriesByProductId: new Map(),
  activeCopyCount: 0,
  fetchedAt: null,
});

/**
 * Folds the hand-kept collections into a Collectr snapshot, producing the one snapshot the
 * rest of the app reads. Collectr's entries are left exactly as they were; the hand-kept
 * ones are appended, so a product held in both shows up under both names.
 */
export function mergeOwnedIntoInventory(
  inventory: InventorySnapshot | null,
  collections: OwnedCollection[]
): InventorySnapshot {
  const base = inventory ?? emptySnapshot();
  const withCards = collections.filter((collection) => collection.cards.length > 0);
  // Names still come through even with no cards yet, so a new collection is selectable.
  const collectionNames = [...base.collectionNames, ...collections.map((c) => c.name)];
  if (withCards.length === 0) {
    return { ...base, collectionNames };
  }

  const entriesByProductId = new Map(
    [...base.entriesByProductId].map(([productId, entries]) => [productId, [...entries]])
  );
  let addedCopies = 0;

  for (const collection of withCards) {
    for (const card of collection.cards) {
      const entry: InventoryEntry = {
        collectionName: collection.name,
        productName: card.name,
        // Owning is not counted, so a held card is exactly one copy. A collection filter
        // asking for more than one will never be satisfied from here.
        printing: card.printing || null,
        conditions: { [DEFAULT_CONDITION]: 1 },
        catalogGroup: card.setName || null,
      };
      const entries = entriesByProductId.get(card.productId);
      if (entries) entries.push(entry);
      else entriesByProductId.set(card.productId, [entry]);
      addedCopies += 1;
    }
  }

  return {
    collectionNames,
    entriesByProductId,
    activeCopyCount: base.activeCopyCount + addedCopies,
    fetchedAt: base.fetchedAt,
  };
}
