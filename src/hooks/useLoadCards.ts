import { useEffect, useState } from "react";
import { loadHierarchy, loadSets, loadPokemonForms } from "../services/cards";
import { generateCardsForSeries } from "../services/runtimeCards";
import { searchErrorsInCollections } from "../utils/helpers";
import type { Card, Set, PokemonFormData, OptionsCollection } from "../types/dashboard";
import type { SeriesSelection } from "../context/CardContext";
import { convertToCollectionObjects } from "../utils/utils";
import { COLLECTIONS } from "../constants/constants";

export function useLoadCards(
  setAllCards: (cards: Card[]) => void,
  setCollections: (collections: OptionsCollection[]) => void,
  setSets: (sets: Set[]) => void,
  setPokemonFormsData: (forms: PokemonFormData[]) => void,
  seriesSelection: SeriesSelection
) {
  const [isMetadataLoading, setIsMetadataLoading] = useState(true);
  const [isCardsLoading, setIsCardsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [setsResponse, formsResponse] = await Promise.all([
          loadSets(),
          loadPokemonForms(),
        ]);
        setSets(setsResponse);
        setCollections(convertToCollectionObjects(COLLECTIONS));
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
    let cancelled = false;

    const fetchCards = async () => {
      setError(null);
      setIsCardsLoading(true);
      try {
        const hierarchy = await loadHierarchy();
        const selectedNames = seriesSelection.included.length > 0
          ? seriesSelection.included
          : seriesSelection.excluded.length > 0
            ? hierarchy
                .map((series) => series.name)
                .filter((name) => !seriesSelection.excluded.includes(name))
            : [];

        if (selectedNames.length === 0) {
          if (!cancelled) setAllCards([]);
          return;
        }

        const seriesIds = hierarchy
          .filter((series) => selectedNames.includes(series.name))
          .map((series) => series.id);
        const responses = await Promise.all(seriesIds.map(generateCardsForSeries));
        const uniqueCards = new Map<string, Card>();
        responses
          .flatMap((response) => response.items)
          .forEach((card) => uniqueCards.set(card.id, card));
        const cards = [...uniqueCards.values()];

        if (!cancelled) {
          searchErrorsInCollections(cards);
          setAllCards(cards);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to generate cards for the selected series.");
          setAllCards([]);
        }
      } finally {
        if (!cancelled) setIsCardsLoading(false);
      }
    };

    fetchCards();
    return () => {
      cancelled = true;
    };
  }, [seriesSelection, setAllCards]);

  return { isLoading: isMetadataLoading || isCardsLoading, error };
}
