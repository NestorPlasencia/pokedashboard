import { useEffect, useMemo, useRef, useState } from "react";
import { loadHierarchy, loadSets, loadPokemonForms } from "../services/cards";
import {
  applyInventoryToCards,
  generateCardsForCollection,
  generateCardsForSeries,
} from "../services/runtimeCards";
import { enrichCollectionCards } from "../utils/collectionEnrichment";
import { countCopies } from "../utils/copyCount";
import { searchErrorsInCollections } from "../utils/helpers";
import type { Card, Set, PokemonFormData, OptionsCollection } from "../types/dashboard";
import type { SeriesSelection } from "../context/CardContext";
import {
  describeInventoryError,
  loadCollectionOptions,
  loadInventory,
  type CollectionOption,
  type InventorySnapshot,
} from "../services/inventory";
import { useAuth } from "../context/AuthContext";
import { loadCached } from "../services/offlineCache";

export type InventoryStatus =
  | "idle"
  | "loading"
  | "ready"
  | "refreshing"
  | "error";

export type CollectionEnrichment = {
  status: "idle" | "loading" | "ready" | "error";
  matched: number;
  total: number;
};

const EMPTY_SERIES_SELECTION: SeriesSelection = { included: [], excluded: [] };

export function useLoadCards(
  setAllCards: (cards: Card[]) => void,
  setCollections: (collections: OptionsCollection[]) => void,
  setSets: (sets: Set[]) => void,
  setPokemonFormsData: (forms: PokemonFormData[]) => void,
  seriesSelection: SeriesSelection,
  inventoryRequired: boolean,
  viewedCollection = "",
  loadAllWhenNoSeries = false,
  /** The viewed collection and its subcollections, whose cards the collection shows. */
  viewedCollectionScope: string[] = []
) {
  // Joined into a key so a scope rebuilt with the same names on every render does not
  // restart the loaders that depend on it.
  const scopeKey = viewedCollectionScope.join("\u0000");
  const scopeNames = useMemo(
    () => (scopeKey ? scopeKey.split("\u0000") : viewedCollection ? [viewedCollection] : []),
    [scopeKey, viewedCollection]
  );
  const [isMetadataLoading, setIsMetadataLoading] = useState(true);
  const [isCardsLoading, setIsCardsLoading] = useState(false);
  const [baseCards, setBaseCards] = useState<Card[]>([]);
  const [inventory, setInventory] = useState<InventorySnapshot | null>(null);
  // Collectr's own collections with their printings, kept apart so one effect can own the
  // list the sidebar shows.
  const [collectrCollections, setCollectrCollections] = useState<CollectionOption[]>([]);
  // The inventory carries names only, so its list is kept apart from the one that knows
  // each collection's printings.
  const [inventoryNames, setInventoryNames] = useState<string[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus>("idle");
  const [isInventoryEmpty, setIsInventoryEmpty] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collectionEnrichment, setCollectionEnrichment] = useState<CollectionEnrichment>({
    status: "idle",
    matched: 0,
    total: 0,
  });
  const { session, inventoryRevision, inventoryPatchTick } = useAuth();
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
    // A collection renders from its own Supabase rows, so it never waits on the catalog's
    // metadata. Set symbols and Pokémon forms still load behind it, for the cards that get
    // matched to the catalog.
    if (viewedCollection) {
      setSets([]);
      setPokemonFormsData([]);
      setIsMetadataLoading(false);
      let cancelled = false;
      loadPokemonForms()
        .then((formsResponse) => {
          if (!cancelled) setPokemonFormsData(formsResponse);
        })
        .catch((metadataError) => {
          console.warn("[collections] Unable to load Pokemon forms for grouping", metadataError);
        });

      return () => {
        cancelled = true;
      };
    }

    const fetchMetadata = async () => {
      try {
        const [setsResponse, formsResponse] = await Promise.all([
          loadSets(),
          loadPokemonForms(),
        ]);
        setSets(setsResponse);
        setPokemonFormsData(formsResponse);
      } catch {
        // A collection is still usable without them; the catalog is not.
        if (!viewedCollection) setError("Unable to load data. Please try again later.");
      } finally {
        setIsMetadataLoading(false);
      }
    };

    fetchMetadata();
    // Metadata is intentionally loaded once per view mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedCollection]);

  useEffect(() => {
    setInventory(null);
    setCollectrCollections([]);
    setInventoryNames([]);
    setIsInventoryEmpty(false);
    setInventoryError(null);
    setInventoryStatus("idle");
    setCollectionEnrichment({ status: "idle", matched: 0, total: 0 });
    handledInventoryRevision.current = 0;
  }, [userId, setCollections]);

  useEffect(() => {
    let cancelled = false;
    if (!userId || isCardsLoading || isMetadataLoading) return;

    const cancelDeferred = deferUntilIdle(() => {
      // TTL 0 on purpose: always ask the network, but fall back to the stored copy when it
      // cannot answer instead of leaving the list empty. A cache that could serve a hit
      // would be wrong here - this effect re-runs on `inventoryRevision` precisely so a
      // renamed or newly created collection shows up at once.
      loadCached(`collections:${userId}`, loadCollectionOptions, 0)
        .then(({ value }) => {
          if (!cancelled) {
            setCollectrCollections(value);
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
    // `inventoryRevision` is in here on purpose: creating or deleting a collection from
    // the sidebar bumps it, and the list has to come back with the new row rather than
    // waiting for a reload.
  }, [userId, isCardsLoading, isMetadataLoading, inventoryRevision, setCollections]);

  useEffect(() => {
    let cancelled = false;
    // Loading the snapshot costs a full account-wide download - every active copy, plus a
    // catalog row for every product ever owned, in chunks - and none of it depends on the
    // series or rarity on screen. So the fetch is gated on the same flag as its use,
    // rather than running on every load only for `effectiveInventory` to discard it.
    if (!userId || !inventoryRequired || isCardsLoading || isMetadataLoading) {
      if (!userId || !inventoryRequired) {
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
      loadInventory({ forceRefresh, userId })
        .then((inventory) => {
          if (cancelled) return;
          handledInventoryRevision.current = inventoryRevision;
          setInventory(inventory);
          setInventoryNames(inventory.collectionNames);
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
    // `inventoryPatchTick` deliberately does not affect `forceRefresh`: a patch already
    // updated the cached snapshot in place, so re-running this effect only needs to read
    // it back out via `loadInventory({ forceRefresh: false })`, which resolves from the
    // cache with no network call.
  }, [
    userId,
    inventoryRevision,
    inventoryPatchTick,
    inventoryRequired,
    isCardsLoading,
    isMetadataLoading,
    setCollections,
  ]);

  // Collections of every origin come from the same query now, so the sidebar list is
  // whatever that returned. Only the names the snapshot reports are added on top, for the
  // window between an inventory refresh and the next read of the collection list.
  useEffect(() => {
    const byName = new Map<string, OptionsCollection>();
    for (const collection of collectrCollections) {
      if (!byName.has(collection.name)) byName.set(collection.name, collection);
    }
    for (const name of inventoryNames) {
      if (byName.has(name)) continue;
      byName.set(name, {
        id: "",
        name,
        printings: [],
        origin: "collectr",
        kind: "owned",
        parentId: null,
        editable: false,
        managedBy: "collectr",
        isPublic: false,
        tags: [],
      });
    }
    setCollections([...byName.values()]);
  }, [collectrCollections, inventoryNames, setCollections]);

  // Cards per collection, counted the way collection view lists them: one per product and
  // printing. Null until the snapshot loads, which the Collections page being open is
  // itself enough to require - see `inventoryRequired` in Main.
  const collectionCardCounts = useMemo(() => {
    if (!inventory) return null;
    const counts = new Map<string, number>();
    for (const entries of inventory.entriesByProductId.values()) {
      for (const entry of entries) {
        counts.set(entry.collectionName, (counts.get(entry.collectionName) ?? 0) + 1);
      }
    }
    return counts;
  }, [inventory]);

  const collectionCopyCounts = useMemo(() => {
    if (!inventory) return null;
    const counts = new Map<string, number>();
    for (const entries of inventory.entriesByProductId.values()) {
      for (const entry of entries) {
        counts.set(
          entry.collectionName,
          (counts.get(entry.collectionName) ?? 0) + countCopies(entry.conditions)
        );
      }
    }
    return counts;
  }, [inventory]);

  // Only fetched when a view needs it, so whatever is loaded is what this view asked for.
  // A second gate here would throw away a download already paid for - which is what left
  // every card stamped with no collections, and the owned button stuck on "Add".
  const effectiveInventory = inventory;

  useEffect(() => {
    if (!effectiveInventory) {
      setAllCards(baseCards);
      return;
    }
    const enrichedCards = applyInventoryToCards(baseCards, effectiveInventory);
    searchErrorsInCollections(enrichedCards);
    setAllCards(enrichedCards);
  }, [baseCards, effectiveInventory, setAllCards]);

  // Series selection controls catalog loading only. Collection cards are already
  // scoped by the active collection, so changing a Series filter must not reload
  // and reset the collection cards.
  const effectiveSeriesSelection = viewedCollection ? EMPTY_SERIES_SELECTION : seriesSelection;

  // Only the collection branch below reads `effectiveInventory` (to rebuild its cards from
  // the fresh snapshot). The catalog branch stamps ownership through the separate effect
  // above instead, so it must not restart on every inventory bump - recording a card would
  // otherwise blow away `baseCards` and regenerate the whole catalog from the external API
  // on every single add or remove, which is both slow and why the button looked like it did
  // nothing: the card briefly disappeared into a full reload instead of just re-stamping.
  const collectionInventoryTrigger = viewedCollection ? effectiveInventory : null;

  useEffect(() => {
    let cancelled = false;

    const fetchCards = async () => {
      setError(null);
      setIsCardsLoading(true);
      setBaseCards([]);
      setCollectionEnrichment({ status: "idle", matched: 0, total: 0 });
      try {
        if (viewedCollection) {
          if (!effectiveInventory) return;
          const collectionResult = generateCardsForCollection(
            effectiveInventory,
            scopeNames
          );
          const collectionCards = collectionResult.items;
          if (!cancelled) {
            setBaseCards(collectionCards);
            setCollectionEnrichment({
              status: "loading",
              matched: 0,
              total: collectionCards.length,
            });
            // Supabase already has enough information to render the collection. Catalog
            // enrichment continues in the background and must not keep this first render
            // behind the global loading state.
            setIsCardsLoading(false);
          }
          console.info("[collections] Built collection from Supabase", {
            viewedCollection,
            cards: collectionCards.length,
          });

          if (collectionCards.length === 0) {
            if (!cancelled) setCollectionEnrichment({ status: "ready", matched: 0, total: 0 });
            return;
          }

          try {
            // The inventory has product ids and set names, while the external catalog is
            // grouped by series. Load only the series that can contain these set names;
            // fall back to the full hierarchy when the mirror has no usable set name.
            const hierarchy = await loadHierarchy();
            const setNames = new Set(
              collectionCards.map((card) => card.setName).filter((name) => name && name !== "Unknown set")
            );
            const matchingSeries = hierarchy.filter((series) =>
              series.sets.some((set) => setNames.has(set.name))
            );
            const seriesToLoad = matchingSeries.length > 0 ? matchingSeries : hierarchy;
            const catalogByProduct = new Map<number, Card[]>();
            let loadedSeries = 0;
            let failedSeries = 0;
            const updateEnrichment = () => {
              const enriched = enrichCollectionCards(collectionCards, catalogByProduct, viewedCollection);
              const matched = enriched.filter((card, index) => card !== collectionCards[index]).length;
              if (cancelled) return;
              setBaseCards(enriched);
              setCollectionEnrichment({
                status: loadedSeries + failedSeries === seriesToLoad.length ? "ready" : "loading",
                matched,
                total: collectionCards.length,
              });
            };

            if (seriesToLoad.length === 0) {
              updateEnrichment();
              return;
            }

            // Requests run in parallel, but each completed series is applied immediately so
            // collection cards progressively gain their real image, metadata and prices.
            await Promise.allSettled(seriesToLoad.map(async (series) => {
              try {
                const response = await generateCardsForSeries(series.id);
                for (const card of response.items) {
                  if (!card.productId) continue;
                  const candidates = catalogByProduct.get(card.productId) ?? [];
                  candidates.push(card);
                  catalogByProduct.set(card.productId, candidates);
                }
                loadedSeries += 1;
              } catch (seriesError) {
                failedSeries += 1;
                console.warn("[collections] Unable to enrich one collection series", {
                  seriesId: series.id,
                  error: seriesError,
                });
              }
              updateEnrichment();
            }));
            if (!cancelled && failedSeries > 0) {
              const enriched = enrichCollectionCards(collectionCards, catalogByProduct, viewedCollection);
              const matched = enriched.filter((card, index) => card !== collectionCards[index]).length;
              setBaseCards(enriched);
              setCollectionEnrichment({ status: "error", matched, total: collectionCards.length });
            }
          } catch (enrichmentError) {
            console.error("[collections] Unable to enrich collection cards", enrichmentError);
            if (!cancelled) {
              // The Supabase fields are still useful as a degraded collection view.
              setCollectionEnrichment({ status: "error", matched: 0, total: collectionCards.length });
            }
          }
          return;
        }

        console.info("[cards] Loading selected series", { effectiveSeriesSelection });
        const hierarchy = await loadHierarchy();
        const selectedNames = effectiveSeriesSelection.included.length > 0
          ? effectiveSeriesSelection.included
          : effectiveSeriesSelection.excluded.length > 0
            ? hierarchy
                .map((series) => series.name)
                .filter((name) => !effectiveSeriesSelection.excluded.includes(name))
            : [];

        if (selectedNames.length === 0 && loadAllWhenNoSeries) {
          // Core wishlist rows are keyed by product_id and do not carry the dashboard's
          // series name. Load the hierarchy and let the wishlist product keys narrow it.
          selectedNames.push(...hierarchy.map((series) => series.name));
        }
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
    // `effectiveInventory` is intentionally left out: `collectionInventoryTrigger` already
    // stands in for it, but only carries a value in collection mode - see its definition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionInventoryTrigger, effectiveSeriesSelection, loadAllWhenNoSeries, viewedCollection, scopeNames]);

  // A collection has nothing to show until its inventory arrives; without this the list
  // would briefly claim that no cards match.
  const isCollectionPending =
    Boolean(viewedCollection) && Boolean(userId) && !effectiveInventory && inventoryStatus !== "error";

  return {
    isLoading: isMetadataLoading || isCardsLoading || isCollectionPending,
    isInventoryEmpty,
    inventoryStatus,
    inventoryUpdatedAt: inventory?.fetchedAt ?? null,
    inventoryError,
    collectionCardCounts,
    collectionCopyCounts,
    collectionEnrichment,
    error,
  };
}
