import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Card } from '../types/dashboard';

import { deleteWishlistNode, restoreWishlistNode, reorderSubcollections, type DeletedNode, cardKey, mergeSavedCards, readWishlists, storageKey, type SavedCard, type Wishlist } from '../services/wishlists';
import { clearLocalBackup, fetchRemoteWishlists, readLocalBackup, saveRemoteWishlists } from '../services/wishlistsRemote';
import { isSupabaseConfigured } from '../services/supabase';
import { useAuth } from './AuthContext';
import { useCardContext } from './CardContext';
import { CATALOG_VIEW } from '../utils/viewMode';
const reference = (card: Card): SavedCard => ({ id: card.id, era: card.setSeries });

function useWishlistsState() {
  const { session } = useAuth();
  const { viewMode, setViewMode } = useCardContext();
  const userId = isSupabaseConfigured ? session?.user.id ?? '' : '';
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [error, setError] = useState('');
  // Set when the initial read failed, so writes never clobber data we could not parse.
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wishlistId, setWishlistId] = useState('');
  const [subcollectionId, setSubcollectionId] = useState('');
  const [deleted, setDeleted] = useState<DeletedNode | null>(null);
  // Browsing a wishlist is one of the app's view modes, so the flag lives with the other
  // two rather than beside the selection.
  const viewing = viewMode.kind === 'wishlist';
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  // A wishlist restored from the URL is only honoured on the first load; switching
  // accounts later starts from a clean selection.
  const pending = useRef(viewMode.kind === 'wishlist' ? { wishlistId: viewMode.wishlistId, subcollectionId: viewMode.subcollectionId } : null);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const restore = pending.current;
    pending.current = null;
    // Only an account change clears the selection. On the first load there is nothing to
    // clear, and blanking the mode here would throw away a collection restored from the URL.
    if (!firstLoad.current) {
      setWishlistId('');
      setSubcollectionId('');
      setViewMode(CATALOG_VIEW);
    }
    firstLoad.current = false;
    setDeleted(null);

    // A restored wishlist only survives if it is still there: a deleted one, or one that
    // belongs to another account, drops back to the catalog instead of showing nothing.
    const reconcile = (data: Wishlist[]) => {
      if (!restore) return;
      const list = data.find(w => w.id === restore.wishlistId);
      if (!list) {
        setWishlistId('');
        setSubcollectionId('');
        setViewMode(CATALOG_VIEW);
        return;
      }
      const subId = list.subcollections.some(s => s.id === restore.subcollectionId) ? restore.subcollectionId : '';
      setWishlistId(list.id);
      setSubcollectionId(subId);
      if (subId !== restore.subcollectionId) setViewMode({ kind: 'wishlist', wishlistId: list.id, subcollectionId: subId });
    };

    const load = async () => {
      if (!userId) {
        try {
          const data = readWishlists(localStorage);
          if (!cancelled) { setWishlists(data); setBlocked(false); setError(''); reconcile(data); }
        } catch {
          if (!cancelled) { setWishlists([]); setBlocked(true); setError('Could not read your saved wishlists. The original data was left untouched.'); reconcile([]); }
        }
        return;
      }
      try {
        const remote = await fetchRemoteWishlists(userId);
        // First sign-in with data still in this browser: move it up, then stop using localStorage.
        const backup = remote.length ? null : readLocalBackup();
        if (backup) {
          await saveRemoteWishlists(userId, backup);
          clearLocalBackup();
        }
        if (!cancelled) { const data = backup ?? remote; setWishlists(data); setBlocked(false); setError(''); reconcile(data); }
      } catch {
        if (!cancelled) { setWishlists([]); setBlocked(true); setError('Could not load your wishlists from Supabase. Nothing will be saved until you reload.'); reconcile([]); }
      }
    };

    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const wishlist = wishlists.find(w => w.id === wishlistId);
  const subcollection = wishlist?.subcollections.find(s => s.id === subcollectionId);
  const entries = useMemo(() => subcollection?.cards ?? wishlist?.subcollections.flatMap(s => s.cards) ?? [], [wishlist, subcollection]);
  const keys = useMemo(() => new Set(entries.map(cardKey)), [entries]);
  const seriesSelection = useMemo(() => ({ included: [...new Set(entries.map(r => r.era))], excluded: [] }), [entries]);

  // Optimistic: state updates right away and persistence errors surface in `error`.
  // Remote writes are chained so a burst of edits lands in order.
  const commit = (next: Wishlist[]) => {
    if (blocked) return false;
    setWishlists(next);
    setError('');
    if (userId) {
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(() => saveRemoteWishlists(userId, next))
        .then(
          () => setError(''),
          () => setError('Could not save to Supabase. Check your connection and try again.')
        );
    } else {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { setError('Could not save. Check your browser storage space and permissions.'); return false; }
    }
    return true;
  };
  // Picks the wishlist the sidebar acts on, and optionally browses it. Selecting is not
  // the same as viewing: you can target a subcollection while still in the catalog.
  const select = (id: string, subId = '', open = false) => {
    setWishlistId(id);
    setSubcollectionId(subId);
    setViewMode(open && id ? { kind: 'wishlist', wishlistId: id, subcollectionId: subId } : CATALOG_VIEW);
  };
  const setViewing = (open: boolean) => {
    setViewMode(open && wishlistId ? { kind: 'wishlist', wishlistId, subcollectionId } : CATALOG_VIEW);
  };
  const create = (name: string, nested: boolean, parentId = wishlistId) => {
    name = name.trim();
    if (!name || (nested && !wishlists.some(w => w.id === parentId))) return false;
    const id = crypto.randomUUID();
    const next = nested ? wishlists.map(w => w.id === parentId ? { ...w, subcollections: [...w.subcollections, { id, name, cards: [] }] } : w) : [...wishlists, { id, name, subcollections: [] }];
    if (!commit(next)) return false;
    select(nested ? parentId : id, nested ? id : '');
    return true;
  };
  const add = (cards: Card[]) => {
    if (!subcollection) return 0;
    const cardsToSave = mergeSavedCards(subcollection.cards, cards.map(reference));
    const saved = commit(wishlists.map(w => w.id === wishlistId ? { ...w, subcollections: w.subcollections.map(s => s.id === subcollectionId ? { ...s, cards: cardsToSave } : s) } : w));
    return saved ? cardsToSave.length - subcollection.cards.length : 0;
  };
  const remove = (card: Card) => {
    const key = cardKey(reference(card));
    commit(wishlists.map(w => w.id === wishlistId ? {
      ...w,
      subcollections: w.subcollections.map(s => (subcollectionId ? s.id === subcollectionId : s.cards.some(r => cardKey(r) === key))
        ? { ...s, cards: s.cards.filter(r => cardKey(r) !== key) }
        : s),
    } : w));
  };
  const deleteNode = (id: string, subId?: string) => {
    const result = deleteWishlistNode(wishlists, id, subId);
    if (!result || !commit(result.wishlists)) return;
    setDeleted(result.deleted);
    if (wishlistId === id && (!subId || subcollectionId === subId)) select(subId ? id : '', '', false);
  };
  const undoDelete = () => {
    if (!deleted) return;
    if (commit(restoreWishlistNode(wishlists, deleted))) setDeleted(null);
  };
  const moveSubcollection = (id: string, subId: string, direction: 'up' | 'down') => {
    commit(reorderSubcollections(wishlists, id, subId, direction));
  };
  const contains = (card: Card) => {
    const key = cardKey(reference(card));
    if (subcollection) return subcollection.cards.some(r => cardKey(r) === key);
    return wishlist?.subcollections.some(s => s.cards.some(r => cardKey(r) === key)) ?? false;
  };
  // Whether the add/remove control applies to this card, so views can give it the slot
  // the "Missing" badge would otherwise occupy.
  const canToggle = (card: Card) => {
    if (!wishlist || (!subcollection && !viewing)) return false;
    return Boolean(subcollection) || contains(card);
  };
  // Splits a card list into one titled section per subcollection, preserving the
  // incoming sort order inside each. Shared by the on-screen view and the print output.
  const groupCards = (cards: Card[]): { label: string; cards: Card[] }[] => {
    if (!viewing || !wishlist) return [{ label: '', cards }];
    const subs = subcollection ? [subcollection] : wishlist.subcollections;
    const used = new Set<string>();
    const groups = subs.map(sub => {
      const subKeys = new Set(sub.cards.map(cardKey));
      const matched = cards.filter(card => subKeys.has(cardKey(reference(card))));
      matched.forEach(card => used.add(cardKey(reference(card))));
      return { label: sub.name, cards: matched };
    }).filter(group => group.cards.length > 0);
    const rest = cards.filter(card => !used.has(cardKey(reference(card))));
    return rest.length ? [...groups, { label: 'Without subcollection', cards: rest }] : groups;
  };
  return { wishlists, wishlist, subcollection, viewing, setViewing, select, create, add, remove, contains, canToggle, groupCards, keys, seriesSelection, error, deleted, deleteNode, undoDelete, moveSubcollection, loading, synced: Boolean(userId) };
}
const Context = createContext<ReturnType<typeof useWishlistsState> | null>(null);
export function WishlistsProvider({ children }: { children: ReactNode }) {
  const value = useWishlistsState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
// eslint-disable-next-line react-refresh/only-export-components
export function useWishlists() {
  const value = useContext(Context);
  if (!value) throw new Error('WishlistsProvider is required');
  return value;
}
