import { CATALOG_VIEW, type ViewMode } from '../utils/viewMode.ts';

export type SavedCard = {
  /** Legacy dashboard card id. New core rows use productId as identity. */
  id: string;
  /** Series for legacy/local rows; empty for a core row until catalog data resolves it. */
  era: string;
  productId?: number;
  printing?: string | null;
};
export type Subcollection = { id: string; name: string; cards: SavedCard[] };
export type Wishlist = { id: string; name: string; subcollections: Subcollection[] };
// The stored value keeps its original name on purpose: changing it would orphan the
// wishlists already saved in browsers that have not signed in yet.
export const storageKey = 'pokedashboard.local-collections.v1';
export const cardKey = (card: Pick<SavedCard, 'id' | 'era' | 'productId' | 'printing'>) =>
  typeof card.productId === 'number' && Number.isInteger(card.productId) && card.productId > 0
    ? JSON.stringify(['product', card.productId, card.printing ?? null])
    : JSON.stringify(['legacy', card.era, card.id]);

export type DeletedNode = { wishlist: Wishlist; subId?: string };

export function deleteWishlistNode(wishlists: Wishlist[], id: string, subId?: string) {
  const wishlist = wishlists.find(w => w.id === id);
  if (!wishlist || (subId && !wishlist.subcollections.some(s => s.id === subId))) return null;
  return {
    deleted: { wishlist, subId } as DeletedNode,
    wishlists: subId
      ? wishlists.map(w => w.id === id ? { ...w, subcollections: w.subcollections.filter(s => s.id !== subId) } : w)
      : wishlists.filter(w => w.id !== id),
  };
}

export function restoreWishlistNode(wishlists: Wishlist[], deleted: DeletedNode): Wishlist[] {
  if (!deleted.subId) {
    return wishlists.some(w => w.id === deleted.wishlist.id) ? wishlists : [...wishlists, deleted.wishlist];
  }
  const sub = deleted.wishlist.subcollections.find(s => s.id === deleted.subId);
  if (!sub) return wishlists;
  return wishlists.map(w => w.id === deleted.wishlist.id && !w.subcollections.some(s => s.id === sub.id)
    ? { ...w, subcollections: [...w.subcollections, sub] } : w);
}

export function reorderSubcollections(wishlists: Wishlist[], wishlistId: string, subId: string, direction: 'up' | 'down'): Wishlist[] {
  return wishlists.map(w => {
    if (w.id !== wishlistId) return w;
    const index = w.subcollections.findIndex(s => s.id === subId);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= w.subcollections.length) return w;
    const subcollections = [...w.subcollections];
    [subcollections[index], subcollections[targetIndex]] = [subcollections[targetIndex], subcollections[index]];
    return { ...w, subcollections };
  });
}

export function mergeSavedCards(existing: SavedCard[], incoming: SavedCard[]): SavedCard[] {
  const unique = new Map(existing.map(card => [cardKey(card), card]));
  incoming.forEach(card => {
    if (card.id && (card.era || (typeof card.productId === 'number' && card.productId > 0))) {
      unique.set(cardKey(card), card);
    }
  });
  return [...unique.values()];
}

export function parseWishlists(data: unknown): Wishlist[] {
  if (!Array.isArray(data)) throw new Error('Invalid wishlists');
  return data.map((wishlist) => {
    if (!wishlist || typeof wishlist !== 'object') throw new Error('Invalid wishlists');
    const value = wishlist as Partial<Wishlist>;
    if (typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' || !value.name || !Array.isArray(value.subcollections)) {
      throw new Error('Invalid wishlists');
    }
    const subcollections = value.subcollections.map((subcollection) => {
      if (!subcollection || typeof subcollection !== 'object') throw new Error('Invalid wishlists');
      const sub = subcollection as Partial<Subcollection>;
      if (typeof sub.id !== 'string' || !sub.id || typeof sub.name !== 'string' || !sub.name || !Array.isArray(sub.cards)) {
        throw new Error('Invalid wishlists');
      }
      const cards = sub.cards.map((card) => {
        if (!card || typeof card !== 'object') throw new Error('Invalid wishlists');
        const saved = card as Partial<SavedCard>;
        if (typeof saved.id !== 'string' || !saved.id || typeof saved.era !== 'string') {
          throw new Error('Invalid wishlists');
        }
        if (saved.productId !== undefined && (!Number.isInteger(saved.productId) || saved.productId <= 0)) {
          throw new Error('Invalid wishlists');
        }
        const result: SavedCard = {
          id: saved.id,
          era: saved.era,
        };
        if (saved.productId !== undefined) result.productId = saved.productId;
        if (typeof saved.printing === 'string' || saved.printing === null) result.printing = saved.printing;
        return result;
      });
      return { id: sub.id, name: sub.name, cards };
    });
    return { id: value.id, name: value.name, subcollections };
  });
}

export function readWishlists(storage: Pick<Storage, 'getItem'>): Wishlist[] {
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  return parseWishlists(JSON.parse(raw));
}

/** The wishlist and subcollection ids a URL asked to reopen. */
export type RestoredSelection = { wishlistId: string; subcollectionId: string };

/**
 * What a wishlist restored from a URL resolves to once the real wishlists are known.
 *
 * A wishlist that is no longer there - deleted, or belonging to a different account -
 * drops back to the catalog instead of leaving the view empty with no way out. A
 * subcollection that is gone keeps the wishlist and opens it whole, which is closer to
 * what the link asked for than giving up on it.
 *
 * Callers must only run this against the wishlists of the signed-in user: resolving it
 * against an empty list while the session is still loading would discard a valid link.
 */
export function resolveRestoredSelection(
  wishlists: Wishlist[],
  restore: RestoredSelection
): RestoredSelection & { mode: ViewMode } {
  const wishlist = wishlists.find(w => w.id === restore.wishlistId);
  if (!wishlist) return { wishlistId: '', subcollectionId: '', mode: CATALOG_VIEW };
  const subcollectionId = wishlist.subcollections.some(s => s.id === restore.subcollectionId)
    ? restore.subcollectionId
    : '';
  return {
    wishlistId: wishlist.id,
    subcollectionId,
    mode: { kind: 'wishlist', wishlistId: wishlist.id, subcollectionId },
  };
}
