import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Card } from '../types/dashboard';
import {
  AppCollectionsUnavailableError,
  addCard,
  createCollection,
  deleteCollection,
  moveCollection,
  removeCard,
  renameCollection,
  setCollectionPrintings,
  setCollectionTag,
  setCollectionVisibility,
  type CollectionTag,
} from '../services/appCollections';
import { patchInventoryCopy } from '../services/inventory';
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
  const { session, isAuthLoading, refreshInventory, notifyInventoryPatched } = useAuth();
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
   * By default the inventory is not updated here: the snapshot is reloaded in full, which
   * is also what makes a failed write visible as the card quietly staying where it was.
   * `onSuccess` lets a caller that already knows exactly what changed - a single card copy
   * - patch the cached snapshot instead, skipping that reload entirely.
   */
  const enqueue = useCallback((write: () => Promise<void>, onSuccess: () => void = refreshInventory) => {
    setError('');
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(write)
      .then(
        () => {
          setError('');
          onSuccess();
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

  /**
   * Nests any collection - including one synced from Collectr - under `parentId`, or
   * lifts it to the top level when `parentId` is null. `parent_id` stays editable on a
   * managed collection even though its name and copies are not, so this is not limited
   * to `editable`.
   */
  const move = async (id: string, parentId: string | null) => {
    if (!userId) return false;
    let moved = false;
    await enqueue(async () => {
      await moveCollection(userId, id, parentId);
      moved = true;
    });
    return moved;
  };

  /**
   * These three reshape the collection itself rather than its contents, so they all take
   * the full-refresh path: `kind` is derived from the `wish` tag and inherited down the
   * tree, printings classify the whole row, and visibility changes what a shared link
   * resolves to. None of that is a single copy the snapshot could be patched for.
   */
  const setTag = async (id: string, tag: CollectionTag, enabled: boolean) => {
    if (!userId) return false;
    let saved = false;
    await enqueue(async () => {
      await setCollectionTag(userId, id, tag, enabled);
      saved = true;
    });
    return saved;
  };

  const setVisibility = async (id: string, isPublic: boolean) => {
    if (!userId) return false;
    let saved = false;
    await enqueue(async () => {
      await setCollectionVisibility(userId, id, isPublic);
      saved = true;
    });
    return saved;
  };

  const setPrintings = async (id: string, current: string[], next: string[]) => {
    if (!userId) return false;
    let saved = false;
    await enqueue(async () => {
      await setCollectionPrintings(userId, id, current, next);
      saved = true;
    });
    return saved;
  };

  /**
   * Patches the cached snapshot for this one card instead of reloading everything, so
   * adding or removing a single copy does not re-download the whole inventory just to
   * reflect itself. Falls back to a full `refreshInventory()` when nothing is cached yet
   * to patch - e.g. the very first write of a session.
   */
  const applyCopyPatch = (card: Card, collection: { id: string; name: string }, action: 'add' | 'remove') => {
    if (!userId || !card.productId) return refreshInventory();
    const patched = patchInventoryCopy(userId, {
      productId: card.productId,
      collectionId: collection.id,
      collectionName: collection.name,
      printing: card.printing || card.variant || null,
      card: { name: card.name, setName: card.setName, number: card.number, rarity: card.rarity, image: card.image },
    }, action);
    if (patched) notifyInventoryPatched();
    else refreshInventory();
  };

  const add = async (card: Card) => {
    if (!userId || !selected) return false;
    const target = selected;
    let added = false;
    await enqueue(
      async () => { await addCard(userId, target.id, card); added = true; },
      () => applyCopyPatch(card, target, 'add')
    );
    return added;
  };

  const removeCardFromSelected = async (card: Card) => {
    if (!userId || !selected) return false;
    const target = selected;
    let removed = false;
    await enqueue(
      async () => { await removeCard(userId, target.id, card); removed = true; },
      () => applyCopyPatch(card, target, 'remove')
    );
    return removed;
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
      create, rename, remove, move, setTag, setVisibility, setPrintings,
      add, removeCard: removeCardFromSelected, has, canTrack,
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
