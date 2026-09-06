export type SavedCard = { id: string; era: string };
export type Subcollection = { id: string; name: string; cards: SavedCard[] };
export type Wishlist = { id: string; name: string; subcollections: Subcollection[] };
// The stored value keeps its original name on purpose: changing it would orphan the
// wishlists already saved in browsers that have not signed in yet.
export const storageKey = 'pokedashboard.local-collections.v1';
export const cardKey = (card: SavedCard) => JSON.stringify([card.era, card.id]);

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
  incoming.forEach(card => { if (card.id && card.era) unique.set(cardKey(card), card); });
  return [...unique.values()];
}

export function parseWishlists(data: unknown): Wishlist[] {
  if (!Array.isArray(data) || !data.every(w => w && typeof w.id === 'string' && typeof w.name === 'string' && Array.isArray(w.subcollections) && w.subcollections.every((s: Subcollection) => s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.cards) && s.cards.every(r => r && typeof r.id === 'string' && !!r.id && typeof r.era === 'string' && !!r.era)))) throw new Error('Invalid wishlists');
  return data;
}

export function readWishlists(storage: Pick<Storage, 'getItem'>): Wishlist[] {
  const raw = storage.getItem(storageKey);
  if (!raw) return [];
  return parseWishlists(JSON.parse(raw));
}
