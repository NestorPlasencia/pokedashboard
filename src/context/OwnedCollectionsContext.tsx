import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Card } from '../types/dashboard';
import {
  AppCollectionsUnavailableError,
  addCard,
  createCollection,
  deleteCollection,
  removeCard,
  renameCollection,
} from '../services/appCollections';
import { isSupabaseConfigured } from '../services/supabase';
import { useAuth } from './AuthContext';
import { useOptionsContext } from './OptionsContext';
import { parseUrlParams, updateUrlParams } from '../utils/urlParams';

/**
 * The collections you can edit, and where the next card you add goes.
 *
 * The collections themselves are not held here: they are rows in Collectr's own tables
 * now, loaded with everything else into the one inventory snapshot and published through
 * `OptionsContext`. What this context owns is the part that is genuinely local - which
 * collection is armed - plus the writes, which go straight to Supabase.
 *
 * Whether a card is already in the armed collection is answered from the card itself:
 * `applyInventoryToCards` stamps every card with the collections holding it, so there is
 * no second source of truth to keep in step.
 */

function useOwnedCollectionsState() {
  const { session, isAuthLoading, refreshInventory } = useAuth();
  const { collections } = useOptionsContext();
  const userId = isSupabaseConfigured ? session?.user.id ?? '' : '';
  // The collection card edits are written to, or '' when adding is off. Restored from the
  // URL and resolved against the loaded data below, so an id for a deleted collection
  // simply disarms.
  const [selectedId, setSelectedIdState] = useState(() => parseUrlParams().addCollection ?? '');
  const [error, setError] = useState('');
  // True while the Supabase columns have not been created yet, so the UI can say where
  // the data lives instead of failing on every write.
  const [remoteUnavailable, setRemoteUnavailable] = useState(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  // Only what the app wrote can be edited; Collectr's mirror is rebuilt by its extension.
  const editable = useMemo(
    () => collections.filter((collection) => collection.editable && collection.kind === 'owned'),
    [collections]
  );

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id);
    updateUrlParams({ addCollection: id || undefined });
  }, []);

  // Resolved against the loaded collections, so an id left in the URL for a collection
  // that is gone - or one belonging to another account - simply disarms.
  const selected = editable.find((collection) => collection.id === selectedId);

  /**
   * Runs a write, keeping a burst of edits in order.
   *
   * The inventory is not updated here: the caller reloads it, which is also what makes a
   * failed write visible as the card quietly staying where it was.
   */
  const enqueue = useCallback((write: () => Promise<void>) => {
    setError('');
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(write)
      .then(
        () => {
          setError('');
          // The rows are the source of truth, so the snapshot - and with it every card's
          // collection membership - is reloaded rather than patched in place.
          refreshInventory();
        },
        (writeError) => {
          if (writeError instanceof AppCollectionsUnavailableError) {
            setRemoteUnavailable(true);
            setError('Apply the shared Supabase schema and its RLS policies to enable your own collections.');
            return;
          }
          setError('Could not save to Supabase. Check your connection and try again.');
        }
      );
    return writeQueue.current;
  }, [refreshInventory]);

  /** Creates a collection, nested under `parentId` when one is given. */
  const create = async (name: string, parentId: string | null = null) => {
    const trimmed = name.trim();
    // Collections are addressed by name in the filter and in the URL, so two with the
    // same name would be indistinguishable - including against one that came from Collectr.
    if (!trimmed) return false;
    if (collections.some((collection) => collection.name === trimmed)) {
      setError('A collection with that name already exists.');
      return false;
    }
    if (!userId) return false;
    let created = '';
    await enqueue(async () => {
      created = await createCollection(userId, {
        name: trimmed,
        kind: 'owned',
        parentId,
      });
    });
    if (!created) return false;
    setSelectedId(created);
    return true;
  };

  /** Resolves to whether the collection is gone, so callers only let go of it when it is. */
  const remove = async (id: string) => {
    if (!userId) return false;
    let removed = false;
    await enqueue(async () => {
      await deleteCollection(userId, id);
      removed = true;
    });
    // A deleted destination must not stay armed.
    if (removed && selectedId === id) setSelectedId('');
    return removed;
  };

  const rename = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !userId) return false;
    // Same rule as creating: a name shared with any other collection would be ambiguous.
    if (collections.some((collection) => collection.id !== id && collection.name === trimmed)) {
      setError('A collection with that name already exists.');
      return false;
    }
    let renamed = false;
    await enqueue(async () => {
      await renameCollection(userId, id, trimmed);
      renamed = true;
    });
    return renamed;
  };

  const add = async (card: Card) => {
    if (!userId || !selected) return false;
    await enqueue(() => addCard(userId, selected.id, card));
    return true;
  };

  const removeCardFromSelected = async (card: Card) => {
    if (!userId || !selected) return false;
    await enqueue(() => removeCard(userId, selected.id, card));
    return true;
  };

  /** Whether the armed collection holds this card, straight off the enriched card. */
  const has = (card: Card) =>
    Boolean(selected && card.collections?.some((entry) => entry.name === selected.name));

  /** The shared copy table requires a valid TCGplayer product id. */
  const canTrack = (card: Card) =>
    typeof card.productId === 'number' && Number.isInteger(card.productId) && card.productId > 0;

  return useMemo(
    () => ({
      collections: editable, selected, selectedId, setSelectedId,
      create, rename, remove, add, removeCard: removeCardFromSelected, has, canTrack,
      error, loading: isAuthLoading, remoteUnavailable,
      synced: Boolean(userId) && !remoteUnavailable,
      names: editable.map((collection) => collection.name),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, selectedId, error, isAuthLoading, remoteUnavailable, userId]
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
