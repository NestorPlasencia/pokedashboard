import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Card } from '../types/dashboard';
import {
  addOwnedCard,
  createOwnedCollection,
  deleteOwnedCollection,
  ownsCard,
  parseOwnedCollections,
  removeOwnedCard,
  storageKey,
  type OwnedCard,
  type OwnedCollection,
} from '../services/ownedCollections';
import {
  OwnedCollectionsUnavailableError,
  fetchRemoteOwnedCollections,
  saveRemoteOwnedCollections,
} from '../services/ownedCollectionsRemote';
import { isSupabaseConfigured } from '../services/supabase';
import { useAuth } from './AuthContext';
import { parseUrlParams, updateUrlParams } from '../utils/urlParams';

/** The identity of a card inside a collection, derived from the catalog card. */
const reference = (card: Card): OwnedCard | null =>
  card.productId
    ? { productId: card.productId, printing: card.variant, name: card.name, setName: card.setName }
    : null;

const readLocal = (): OwnedCollection[] => {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? parseOwnedCollections(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
};

const writeLocal = (collections: OwnedCollection[]) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(collections));
    return true;
  } catch {
    return false;
  }
};

function useOwnedCollectionsState() {
  const { session, isAuthLoading } = useAuth();
  const userId = isSupabaseConfigured ? session?.user.id ?? '' : '';
  const [collections, setCollections] = useState<OwnedCollection[]>([]);
  // The collection card edits are written to, or '' when adding is off. Restored from the
  // URL and resolved against the loaded data below, so an id for a deleted collection
  // simply disarms.
  const [selectedId, setSelectedIdState] = useState(() => parseUrlParams().addCollection ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // True while the Supabase table has not been created yet, so writes stay in this browser
  // instead of failing. Flipping it also tells the UI to say where the data lives.
  const [remoteUnavailable, setRemoteUnavailable] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    // Same reason as the wishlists: until the session is known, "signed out" and "still
    // loading" look identical, and reading the wrong source would show the wrong data.
    if (isAuthLoading) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    const load = async () => {
      if (!userId) {
        if (!cancelled) { setCollections(readLocal()); setRemoteUnavailable(false); }
        return;
      }
      try {
        const remote = await fetchRemoteOwnedCollections(userId);
        // First run with data still in this browser: move it up, then stop using localStorage.
        const local = remote.length ? [] : readLocal();
        if (local.length) await saveRemoteOwnedCollections(userId, local);
        if (!cancelled) {
          setCollections(local.length ? local : remote);
          setRemoteUnavailable(false);
          if (local.length) localStorage.removeItem(storageKey);
        }
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof OwnedCollectionsUnavailableError) {
          // Expected until the SQL is run: keep working locally, no error shown.
          setCollections(readLocal());
          setRemoteUnavailable(true);
          return;
        }
        setCollections([]);
        setError('Could not load your collections from Supabase.');
      }
    };

    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, isAuthLoading]);

  /** Optimistic: state moves now, persistence errors surface in `error`. */
  const commit = useCallback((next: OwnedCollection[]) => {
    setCollections(next);
    setError('');
    if (userId && !remoteUnavailable) {
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(() => saveRemoteOwnedCollections(userId, next))
        .then(
          () => setError(''),
          (saveError) => {
            if (saveError instanceof OwnedCollectionsUnavailableError) {
              setRemoteUnavailable(true);
              writeLocal(next);
              return;
            }
            setError('Could not save to Supabase. Check your connection and try again.');
          }
        );
      return true;
    }
    if (!writeLocal(next)) {
      setError('Could not save. Check your browser storage space and permissions.');
      return false;
    }
    return true;
  }, [userId, remoteUnavailable]);

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id);
    updateUrlParams({ addCollection: id || undefined });
  }, []);

  const selected = collections.find((collection) => collection.id === selectedId);

  const create = (name: string) => {
    const next = createOwnedCollection(collections, name, crypto.randomUUID());
    if (!next) {
      setError(name.trim() ? 'A collection with that name already exists.' : '');
      return false;
    }
    if (!commit(next)) return false;
    setSelectedId(next[next.length - 1].id);
    return true;
  };

  const remove = (id: string) => {
    if (!commit(deleteOwnedCollection(collections, id))) return;
    // A deleted destination must not stay armed.
    if (selectedId === id) setSelectedId('');
  };

  const add = (card: Card) => {
    const row = reference(card);
    if (!row || !selected) return false;
    return commit(addOwnedCard(collections, selected.id, row));
  };

  const remove_ = (card: Card) => {
    const row = reference(card);
    if (!row || !selected) return false;
    return commit(removeOwnedCard(collections, selected.id, row));
  };

  /** Whether the armed collection holds this exact card and printing. */
  const has = (card: Card) => {
    const row = reference(card);
    return row ? ownsCard(selected, row) : false;
  };

  /** Cards with no TCGplayer product cannot be matched back to the catalog. */
  const canTrack = (card: Card) => Boolean(card.productId);

  return useMemo(
    () => ({
      collections, selected, selectedId, setSelectedId,
      create, remove, add, removeCard: remove_, has, canTrack,
      error, loading, remoteUnavailable,
      synced: Boolean(userId) && !remoteUnavailable,
      names: collections.map((collection) => collection.name),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collections, selectedId, error, loading, remoteUnavailable, userId]
  );
}

const Context = createContext<ReturnType<typeof useOwnedCollectionsState> | null>(null);

export function OwnedCollectionsProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useOwnedCollectionsState()}>{children}</Context.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOwnedCollections() {
  const value = useContext(Context);
  if (!value) throw new Error('OwnedCollectionsProvider is required');
  return value;
}
