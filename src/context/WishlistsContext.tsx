import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Card } from "../types/dashboard";
import {
  deleteWishlistNode,
  restoreWishlistNode,
  reorderSubcollections,
  resolveRestoredSelection,
  type DeletedNode,
  cardKey,
  mergeSavedCards,
  readWishlists,
  storageKey,
  type SavedCard,
  type Wishlist,
} from "../services/wishlists";
import {
  addRemoteCard,
  createRemoteCollection,
  deleteRemoteCollection,
  fetchRemoteWishlists,
  readLocalBackup,
  removeRemoteCard,
} from "../services/wishlistsRemote";
import { isSupabaseConfigured } from "../services/supabase";
import { useAuth } from "./AuthContext";
import { useCardContext } from "./CardContext";
import { CATALOG_VIEW } from "../utils/viewMode";
import { parseUrlParams, updateUrlParams } from "../utils/urlParams";

const reference = (card: Card): SavedCard => ({
  id: card.id,
  era: card.setSeries,
  productId: card.productId,
  printing: card.printing || card.variant || null,
});

function useWishlistsState() {
  const { session, isAuthLoading } = useAuth();
  const { viewMode, setViewMode } = useCardContext();
  const userId = isSupabaseConfigured ? session?.user.id ?? "" : "";
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wishlistId, setWishlistId] = useState("");
  const [subcollectionId, setSubcollectionId] = useState("");
  const [deleted, setDeleted] = useState<DeletedNode | null>(null);
  const viewing = viewMode.kind === "wishlist";
  const [armedSubId, setArmedSubIdState] = useState(() => parseUrlParams().addWishlist ?? "");
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(viewMode.kind === "wishlist" ? { wishlistId: viewMode.wishlistId, subcollectionId: viewMode.subcollectionId } : null);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (isAuthLoading) return;
    let cancelled = false;
    setLoading(true);
    const restore = pending.current;
    pending.current = null;
    if (!firstLoad.current) {
      setWishlistId("");
      setSubcollectionId("");
      setViewMode(CATALOG_VIEW);
    }
    firstLoad.current = false;
    setDeleted(null);

    const reconcile = (data: Wishlist[]) => {
      if (!restore) return;
      const resolved = resolveRestoredSelection(data, restore);
      setWishlistId(resolved.wishlistId);
      setSubcollectionId(resolved.subcollectionId);
      setViewMode(resolved.mode);
    };

    const load = async () => {
      if (!userId) {
        try {
          const data = readWishlists(localStorage);
          if (!cancelled) {
            setWishlists(data);
            setBlocked(false);
            setError("");
            reconcile(data);
          }
        } catch {
          if (!cancelled) {
            setWishlists([]);
            setBlocked(true);
            setError("Could not read your saved wishlists. The original data was left untouched.");
            reconcile([]);
          }
        }
        return;
      }
      try {
        const data = await fetchRemoteWishlists(userId);
        // A legacy local backup is never deleted automatically: old rows do not always
        // contain a product_id, which the new core schema requires.
        if (!cancelled) {
          setWishlists(data);
          setBlocked(false);
          setError(readLocalBackup() ? "A legacy local wishlist backup is still available on this device." : "");
          reconcile(data);
        }
      } catch {
        if (!cancelled) {
          setWishlists([]);
          setBlocked(true);
          setError("Could not load your wishlists from Supabase. Nothing will be saved until you reload.");
          reconcile([]);
        }
      }
    };

    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAuthLoading]);

  const setArmedSubId = useCallback((subId: string) => {
    setArmedSubIdState(subId);
    updateUrlParams({ addWishlist: subId || undefined });
  }, []);

  const wishlist = wishlists.find((w) => w.id === wishlistId);
  const subcollection = wishlist?.subcollections.find((s) => s.id === subcollectionId);
  const armedWishlist = armedSubId ? wishlists.find((w) => w.subcollections.some((s) => s.id === armedSubId)) : undefined;
  const armedSubcollection = armedWishlist?.subcollections.find((s) => s.id === armedSubId);
  const entries = useMemo(() => subcollection?.cards ?? wishlist?.subcollections.flatMap((s) => s.cards) ?? [], [wishlist, subcollection]);
  const keys = useMemo(() => new Set(entries.map(cardKey)), [entries]);
  const seriesSelection = useMemo(
    () => ({ included: [...new Set(entries.map((entry) => entry.era).filter(Boolean))], excluded: [] }),
    [entries]
  );

  const enqueueRemote = useCallback((operation: () => Promise<void>) => {
    const pendingWrite = saveQueue.current.catch(() => undefined).then(operation);
    saveQueue.current = pendingWrite.then(() => undefined, () => undefined);
    pendingWrite.catch(() => setError("Could not save to Supabase. Check your connection and try again."));
    return pendingWrite;
  }, []);

  const commitLocal = useCallback((next: Wishlist[]) => {
    if (blocked) return false;
    setWishlists(next);
    if (!userId) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        setError("Could not save. Check your browser storage space and permissions.");
        return false;
      }
    }
    return true;
  }, [blocked, userId]);

  const select = (id: string, subId = "", open = false) => {
    setWishlistId(id);
    setSubcollectionId(subId);
    setViewMode(open && id ? { kind: "wishlist", wishlistId: id, subcollectionId: subId } : CATALOG_VIEW);
  };

  const setViewing = (open: boolean) => {
    setViewMode(open && wishlistId ? { kind: "wishlist", wishlistId, subcollectionId } : CATALOG_VIEW);
  };

  const create = async (name: string, nested: boolean, parentId = wishlistId) => {
    name = name.trim();
    if (blocked || !name || (nested && !wishlists.some((w) => w.id === parentId))) return false;
    if (wishlists.some((w) => w.name === name || w.subcollections.some((s) => s.name === name))) return false;

    if (userId) {
      try {
        await enqueueRemote(() => createRemoteCollection(userId, name, nested ? parentId : null, "wishlist").then(() => undefined));
        const refreshed = await fetchRemoteWishlists(userId);
        setWishlists(refreshed);
        const created = nested
          ? refreshed.find((w) => w.id === parentId)?.subcollections.find((s) => s.name === name)
          : refreshed.find((w) => w.name === name);
        if (created) select(nested ? parentId : created.id, nested ? created.id : "");
        return Boolean(created);
      } catch {
        return false;
      }
    }

    const id = crypto.randomUUID();
    const next = nested
      ? wishlists.map((w) => w.id === parentId ? { ...w, subcollections: [...w.subcollections, { id, name, cards: [] }] } : w)
      : [...wishlists, { id, name, subcollections: [] }];
    if (!commitLocal(next)) return false;
    select(nested ? parentId : id, nested ? id : "");
    return true;
  };

  const add = async (cards: Card[]) => {
    if (blocked || !armedSubcollection || !armedWishlist) return 0;
    // The shared remote schema identifies wishlist cards by product_id. Local backups may
    // still contain older id/era-only entries, so keep those usable offline but never report
    // them as remotely saved.
    const cardsToPersist = userId
      ? cards.filter((card) => typeof card.productId === "number" && Number.isInteger(card.productId) && card.productId > 0)
      : cards;
    const incoming = cardsToPersist.map(reference);
    const cardsToSave = mergeSavedCards(armedSubcollection.cards, incoming);
    const existingKeys = new Set(armedSubcollection.cards.map(cardKey));
    const newCards = cardsToSave.filter((card) => !existingKeys.has(cardKey(card)));
    if (!newCards.length) return 0;
    const next = wishlists.map((w) => w.id === armedWishlist.id
      ? { ...w, subcollections: w.subcollections.map((s) => s.id === armedSubId ? { ...s, cards: cardsToSave } : s) }
      : w);
    if (!commitLocal(next)) return 0;
    if (userId) {
      void enqueueRemote(async () => {
        for (const card of cardsToPersist.filter((candidate) => newCards.some((saved) => cardKey(saved) === cardKey(reference(candidate))))) {
          await addRemoteCard(userId, armedSubcollection.id, card);
        }
      });
    }
    return newCards.length;
  };

  const remove = (card: Card) => {
    if (blocked || !armedSubcollection || !armedWishlist) return;
    const key = cardKey(reference(card));
    const next = wishlists.map((w) => w.id === armedWishlist.id ? {
      ...w,
      subcollections: w.subcollections.map((s) => s.id === armedSubId ? { ...s, cards: s.cards.filter((saved) => cardKey(saved) !== key) } : s),
    } : w);
    if (!commitLocal(next) || !userId) return;
    void enqueueRemote(() => removeRemoteCard(userId, armedSubcollection.id, card));
  };

  const deleteNode = (id: string, subId?: string) => {
    const result = deleteWishlistNode(wishlists, id, subId);
    if (!result || !commitLocal(result.wishlists)) return;
    setDeleted(userId ? null : result.deleted);
    if (userId) void enqueueRemote(() => deleteRemoteCollection(userId, subId ?? id));
    if (wishlistId === id && (!subId || subcollectionId === subId)) select(subId ? id : "", "", false);
    if (armedSubId && (subId ? subId === armedSubId : wishlists.find((w) => w.id === id)?.subcollections.some((s) => s.id === armedSubId))) {
      setArmedSubId("");
    }
  };

  const undoDelete = () => {
    if (!deleted) return;
    if (commitLocal(restoreWishlistNode(wishlists, deleted))) setDeleted(null);
  };

  const moveSubcollection = (id: string, subId: string, direction: "up" | "down") => {
    if (userId) {
      setError("The new Supabase schema orders subcollections by name.");
      return;
    }
    commitLocal(reorderSubcollections(wishlists, id, subId, direction));
  };

  const contains = (card: Card) => Boolean(armedSubcollection?.cards.some((saved) => cardKey(saved) === cardKey(reference(card))));
  const canToggle = () => Boolean(armedSubcollection);
  const groupCards = (cards: Card[]): { label: string; cards: Card[] }[] => {
    if (!viewing || !wishlist) return [{ label: "", cards }];
    const subs = subcollection ? [subcollection] : wishlist.subcollections;
    const used = new Set<string>();
    const groups = subs.map((sub) => {
      const subKeys = new Set(sub.cards.map(cardKey));
      const matched = cards.filter((card) => subKeys.has(cardKey(reference(card))));
      matched.forEach((card) => used.add(cardKey(reference(card))));
      return { label: sub.name, cards: matched };
    }).filter((group) => group.cards.length > 0);
    const rest = cards.filter((card) => !used.has(cardKey(reference(card))));
    return rest.length ? [...groups, { label: "Without subcollection", cards: rest }] : groups;
  };

  return {
    wishlists, wishlist, subcollection, viewing, setViewing, select, create, add, remove, contains,
    canToggle, groupCards, keys, seriesSelection, error, deleted, deleteNode, undoDelete, moveSubcollection,
    loading, synced: Boolean(userId), armedSubId, setArmedSubId, armedWishlist, armedSubcollection,
  };
}

const Context = createContext<ReturnType<typeof useWishlistsState> | null>(null);
export function WishlistsProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useWishlistsState()}>{children}</Context.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWishlists() {
  const value = useContext(Context);
  if (!value) throw new Error("WishlistsProvider is required");
  return value;
}
