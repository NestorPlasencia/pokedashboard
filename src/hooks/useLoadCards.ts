import { useEffect, useMemo, useRef, useState } from "react";
import { loadHierarchy, loadSets, loadPokemonForms } from "../services/cards";
import {
  applyInventoryToCards,
  generateCardsForSeries,
} from "../services/runtimeCards";
import { searchErrorsInCollections } from "../utils/helpers";
import type { Card, Set, PokemonFormData, OptionsCollection } from "../types/dashboard";
import type { SeriesSelection } from "../context/CardContext";
import { convertToCollectionObjects } from "../utils/utils";
import {
  describeInventoryError,
  loadCollectionNames,
  loadInventory,
  type InventorySnapshot,
} from "../services/inventory";
import { useAuth } from "../context/AuthContext";
import { mergeOwnedIntoInventory } from "../services/ownedCollections";
import { useOwnedCollections } from "../context/OwnedCollectionsContext";

export type InventoryStatus =
  | "idle"
  | "loading"
  | "ready"
  | "refreshing"
  | "error";

export function useLoadCards(
  setAllCards: (cards: Card[]) => void,
  setCollections: (collections: OptionsCollection[]) => void,
  setSets: (sets: Set[]) => void,
  setPokemonFormsData: (forms: PokemonFormData[]) => void,
  seriesSelection: SeriesSelection,
  inventoryRequired: boolean,
  viewedCollection = ""
) {
  const [isMetadataLoading, setIsMetadataLoading] = useState(true);
  const [isCardsLoading, setIsCardsLoading] = useState(false);
  const [baseCards, setBaseCards] = useState<Card[]>([]);
  const [setsMetadata, setSetsMetadata] = useState<Set[]>([]);
  const [inventory, setInventory] = useState<InventorySnapshot | null>(null);
  // Collectr's own names, kept apart so one effect can own the list the sidebar shows.
  const [collectrNames, setCollectrNames] = useState<string[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus>("idle");
  const [isInventoryEmpty, setIsInventoryEmpty] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session, inventoryRevision } = useAuth();
  const owned = useOwnedCollections();
  const userId = session?.user.id;
  const handledInventoryRevision = useRef(inventoryRevision);

  const deferUntilIdle = (callback: () => void) => {
    if (typeof window === "undefined") return () => undefined;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(callback);
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(callback, 0);
    return () => window.clearTimeout(handle);
  };

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [setsResponse, formsResponse] = await Promise.all([
          loadSets(),
          loadPokemonForms(),
        ]);
        setSets(setsResponse);
        setSetsMetadata(setsResponse);
        setPokemonFormsData(formsResponse);
      } catch {
        setError("Unable to load data. Please try again later.");
      } finally {
        setIsMetadataLoading(false);
      }
    };

    fetchMetadata();
    // Metadata is intentionally loaded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setInventory(null);
    setCollectrNames([]);
    setIsInventoryEmpty(false);
    setInventoryError(null);
    setInventoryStatus("idle");
    handledInventoryRevision.current = 0;
  }, [userId, setCollections]);

  useEffect(() => {
    let cancelled = false;
    if (!userId || isCardsLoading || isMetadataLoading) return;

    const cancelDeferred = deferUntilIdle(() => {
      loadCollectionNames()
        .then((collectionNames) => {
          if (!cancelled) {
            setCollectrNames(collectionNames);
          }
        })
        .catch((collectionLoadError) => {
          console.error(
            `[collections] Unable to load collection names: ${describeInventoryError(collectionLoadError)}`
          );
        });
    });

    return () => {
      cancelled = true;
      cancelDeferred();
    };
  }, [userId, isCardsLoading, isMetadataLoading, setCollections]);

  useEffect(() => {
    let cancelled = false;
    if (!userId || isCardsLoading || isMetadataLoading) {
      if (!userId) {
        setInventoryStatus("idle");
        setInventoryError(null);
      }
      return;
    }

    const forceRefresh = inventoryRevision !== handledInventoryRevision.current;
    setInventoryStatus((current) =>
      current === "ready" ? "refreshing" : "loading"
    );
    setInventoryError(null);
    const cancelDeferred = deferUntilIdle(() => {
      loadInventory({ forceRefresh })
        .then((inventory) => {
          if (cancelled) return;
          handledInventoryRevision.current = inventoryRevision;
          setInventory(inventory);
          setCollectrNames(inventory.collectionNames);
          setIsInventoryEmpty(inventory.activeCopyCount === 0);
          setInventoryStatus("ready");
        })
        .catch((inventoryLoadError) => {
          const description = describeInventoryError(inventoryLoadError);
          console.error(`[collections] Unable to load Supabase inventory: ${description}`);
          if (!cancelled) {
            if (inventoryRequired) {
              setInventoryError(`Unable to load your Supabase collections (${description}).`);
            }
            setInventoryStatus("error");
          }
        });
    });

    return () => {
      cancelled = true;
      cancelDeferred();
    };
  }, [
    userId,
    inventoryRevision,
    inventoryRequired,
    isCardsLoading,
    isMetadataLoading,
    setCollections,
  ]);

  // The sidebar lists both sources as one set of collections. Deduplicated because a
  // hand-kept collection may share a name with a Collectr one, and the filter addresses
  // collections by name.
  useEffect(() => {
    setCollections(convertToCollectionObjects([...new Set([...collectrNames, ...owned.names])]));
  }, [collectrNames, owned.names, setCollections]);

  // Hand-kept collections are folded in here, so everything downstream - the collection
  // filter, the "View" mode, the owned counters, Missing, print - sees one inventory and
  // needs no idea that some of it never came from Collectr.
  const effectiveInventory = useMemo(
    () => mergeOwnedIntoInventory(inventoryRequired ? inventory : null, owned.collections),
    [inventory, inventoryRequired, owned.collections]
  );

  useEffect(() => {
    const hasCollectrInventory = inventoryRequired && inventory;
    const hasOwnedCards = owned.collections.some((collection) => collection.cards.length > 0);
    if (!hasCollectrInventory && !hasOwnedCards) {
      setAllCards(baseCards);
      return;
    }
    const enrichedCards = applyInventoryToCards(baseCards, effectiveInventory);
    searchErrorsInCollections(enrichedCards);
    setAllCards(enrichedCards);
  }, [baseCards, inventory, inventoryRequired, effectiveInventory, owned.collections, setAllCards]);

  const seriesForCollection = useMemo(() => {
    if (!viewedCollection) return null;
    const inventory = effectiveInventory;
    // Collectr names the set ("Evolving Skies"); the hierarchy carries the same names,
    // so matching on a normalized name resolves the series without a shared id.
    const normalize = (name: string) => name.trim().toLowerCase();
    const seriesBySetName = new Map<string, string>();
    for (const set of setsMetadata) {
      if (set.name) seriesBySetName.set(normalize(set.name), set.series);
    }
    const included = new Set<string>();
    const unresolved = new Set<string>();
    const collectionNames = new Set<string>();
    let matched = 0;
    let withoutGroup = 0;
    for (const entries of inventory.entriesByProductId.values()) {
      for (const entry of entries) {
        collectionNames.add(entry.collectionName);
        if (entry.collectionName !== viewedCollection) continue;
        matched++;
        if (!entry.catalogGroup) { withoutGroup++; continue; }
        const series = seriesBySetName.get(normalize(entry.catalogGroup));
        if (series) included.add(series);
        else unresolved.add(entry.catalogGroup);
      }
    }
    console.info("[collections] Series resolution", {
      viewedCollection,
      entriesInCollection: matched,
      entriesWithoutCatalogGroup: withoutGroup,
      knownSets: seriesBySetName.size,
      resolvedSeries: [...included],
      unmatchedSetNames: [...unresolved],
      availableCollections: [...collectionNames],
    });
    return { included: [...included], excluded: [] } as SeriesSelection;
  }, [viewedCollection, effectiveInventory, setsMetadata]);

  const effectiveSeriesSelection = seriesForCollection ?? seriesSelection;

  useEffect(() => {
    let cancelled = false;

    const fetchCards = async () => {
      setError(null);
      setIsCardsLoading(true);
      setBaseCards([]);
      try {
        console.info("[cards] Loading selected series", { effectiveSeriesSelection });
        const hierarchy = await loadHierarchy();
        const selectedNames = effectiveSeriesSelection.included.length > 0
          ? effectiveSeriesSelection.included
          : effectiveSeriesSelection.excluded.length > 0
            ? hierarchy
                .map((series) => series.name)
                .filter((name) => !effectiveSeriesSelection.excluded.includes(name))
            : [];

        if (selectedNames.length === 0) {
          if (!cancelled) setBaseCards([]);
          return;
        }

        const seriesIds = hierarchy
          .filter((series) => selectedNames.includes(series.name))
          .map((series) => series.id);
        console.info("[cards] Resolved series selection", {
          selectedNames,
          seriesIds,
        });
        const responses = await Promise.all(seriesIds.map(generateCardsForSeries));
        const uniqueCards = new Map<string, Card>();
        responses
          .flatMap((response) => response.items)
          .forEach((card) => uniqueCards.set(card.id, card));
        const cards = [...uniqueCards.values()];

        if (!cancelled) {
          setBaseCards(cards);
        }
      } catch (error) {
        console.error("[cards] Unable to generate selected series", {
          effectiveSeriesSelection,
          error,
        });
        if (!cancelled) {
          setError("Unable to generate cards for the selected series.");
          setBaseCards([]);
        }
      } finally {
        if (!cancelled) setIsCardsLoading(false);
      }
    };

    fetchCards();
    return () => {
      cancelled = true;
    };
  }, [effectiveSeriesSelection]);

  return {
    isLoading: isMetadataLoading || isCardsLoading,
    isInventoryEmpty,
    inventoryStatus,
    inventoryUpdatedAt: inventory?.fetchedAt ?? null,
    inventoryError,
    error,
  };
}
