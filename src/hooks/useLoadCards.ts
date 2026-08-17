import { useEffect, useRef, useState } from "react";
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
  loadInventory,
  type InventorySnapshot,
} from "../services/inventory";
import { useAuth } from "../context/AuthContext";

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
  inventoryRequired: boolean
) {
  const [isMetadataLoading, setIsMetadataLoading] = useState(true);
  const [isCardsLoading, setIsCardsLoading] = useState(false);
  const [baseCards, setBaseCards] = useState<Card[]>([]);
  const [inventory, setInventory] = useState<InventorySnapshot | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<InventoryStatus>("idle");
  const [isInventoryEmpty, setIsInventoryEmpty] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session, inventoryRevision } = useAuth();
  const userId = session?.user.id;
  const handledInventoryRevision = useRef(inventoryRevision);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [setsResponse, formsResponse] = await Promise.all([
          loadSets(),
          loadPokemonForms(),
        ]);
        setSets(setsResponse);
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
    setCollections([]);
    setIsInventoryEmpty(false);
    setInventoryError(null);
    setInventoryStatus("idle");
    handledInventoryRevision.current = 0;
  }, [userId, setCollections]);

  useEffect(() => {
    let cancelled = false;
    if (!inventoryRequired || !userId) {
      setInventoryStatus("idle");
      setInventoryError(null);
      return;
    }

    const forceRefresh = inventoryRevision !== handledInventoryRevision.current;
    setInventoryStatus((current) =>
      current === "ready" ? "refreshing" : "loading"
    );
    setInventoryError(null);
    loadInventory({ forceRefresh })
      .then((inventory) => {
        if (cancelled) return;
        handledInventoryRevision.current = inventoryRevision;
        setInventory(inventory);
        setCollections(convertToCollectionObjects(inventory.collectionNames));
        setIsInventoryEmpty(inventory.activeCopyCount === 0);
        setInventoryStatus("ready");
      })
      .catch((inventoryLoadError) => {
        const description = describeInventoryError(inventoryLoadError);
        console.error(`[collections] Unable to load Supabase inventory: ${description}`);
        if (!cancelled) {
          setInventoryError(`Unable to load your Supabase collections (${description}).`);
          setInventoryStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inventoryRequired, inventoryRevision, userId, setCollections]);

  useEffect(() => {
    if (!inventoryRequired || !inventory) {
      setAllCards(baseCards);
      return;
    }
    const enrichedCards = applyInventoryToCards(baseCards, inventory);
    searchErrorsInCollections(enrichedCards);
    setAllCards(enrichedCards);
  }, [baseCards, inventory, inventoryRequired, setAllCards]);

  useEffect(() => {
    let cancelled = false;

    const fetchCards = async () => {
      setError(null);
      setIsCardsLoading(true);
      setBaseCards([]);
      try {
        console.info("[cards] Loading selected series", { seriesSelection });
        const hierarchy = await loadHierarchy();
        const selectedNames = seriesSelection.included.length > 0
          ? seriesSelection.included
          : seriesSelection.excluded.length > 0
            ? hierarchy
                .map((series) => series.name)
                .filter((name) => !seriesSelection.excluded.includes(name))
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
          seriesSelection,
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
  }, [seriesSelection]);

  return {
    isLoading: isMetadataLoading || isCardsLoading,
    isInventoryEmpty,
    inventoryStatus,
    inventoryUpdatedAt: inventory?.fetchedAt ?? null,
    inventoryError,
    error,
  };
}
