import React, { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { Card, PokemonWithoutCard, PokemonFormWithoutCard, PokemonFormData, PokemonGroupingOptions, CollectionFilterOptions, ViewOptions, SortConfig, Set } from "../types/dashboard";
import { initializeFiltersFromUrl } from "../utils/urlParams";

export type SeriesSelection = {
  included: string[];
  excluded: string[];
};

interface CardContextType {
  // ========== Card Data States (hierarchical order) ==========
  // All imported cards (base data)
  allCards: Card[];
  setAllCards: React.Dispatch<React.SetStateAction<Card[]>>;

  // After basic filters (Set, Rarity, Type, Energy, Variants, Conditions)
  filteredCards: Card[];
  setFilteredCards: React.Dispatch<React.SetStateAction<Card[]>>;

  // After price range filter
  priceFilteredCards: Card[];
  setPriceFilteredCards: React.Dispatch<React.SetStateAction<Card[]>>;

  // After sorting
  sortedCards: Card[];
  setSortedCards: React.Dispatch<React.SetStateAction<Card[]>>;

  // After collection filter (hide/shadow owned/not-owned)
  collectionFilteredCards: Card[];
  setCollectionFilteredCards: React.Dispatch<React.SetStateAction<Card[]>>;

  // After Pokemon grouping filter (includes placeholders if enabled)
  groupedCards: (Card | PokemonWithoutCard | PokemonFormWithoutCard)[];
  setGroupedCards: React.Dispatch<React.SetStateAction<(Card | PokemonWithoutCard | PokemonFormWithoutCard)[]>>;

  // Final visible cards (after search)
  visibleCards: (Card | PokemonWithoutCard | PokemonFormWithoutCard)[];
  setVisibleCards: React.Dispatch<React.SetStateAction<(Card | PokemonWithoutCard | PokemonFormWithoutCard)[]>>;

  // Sets Data
  sets: Set[];
  setSets: React.Dispatch<React.SetStateAction<Set[]>>;
  seriesSelection: SeriesSelection;
  setSeriesSelection: React.Dispatch<React.SetStateAction<SeriesSelection>>;

  // ========== Filter States ==========
  // Variants filter (Normal, Reverse Holo, Normal Holo, etc.)
  variantsFilter: string[];
  setVariantsFilter: React.Dispatch<React.SetStateAction<string[]>>;

  // Conditions filter (Near Mint, Lightly Played, etc.)
  conditionsFilter: string[];
  setConditionsFilter: React.Dispatch<React.SetStateAction<string[]>>;

  // Price range filter
  priceRange: { min: number | null; max: number | null };
  setPriceRange: React.Dispatch<React.SetStateAction<{ min: number | null; max: number | null }>>;

  // Collection filter options
  collectionFilter: CollectionFilterOptions;
  setCollectionFilter: React.Dispatch<React.SetStateAction<CollectionFilterOptions>>;

  // Pokemon Grouping options (unified Pokédex + Forms)
  pokemonGrouping: PokemonGroupingOptions;
  setPokemonGrouping: React.Dispatch<React.SetStateAction<PokemonGroupingOptions>>;

  // Pokemon Forms data (loaded from the API)
  pokemonFormsData: PokemonFormData[];
  setPokemonFormsData: React.Dispatch<React.SetStateAction<PokemonFormData[]>>;

  // Sort configuration
  sortConfig: SortConfig;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig>>;

  // View options
  viewOptions: ViewOptions;
  setViewOptions: React.Dispatch<React.SetStateAction<ViewOptions>>;
}

const CardContext = createContext<CardContextType | undefined>(undefined);

export const CardProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // ========== Card Data States ==========
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [filteredCards, setFilteredCards] = useState<Card[]>([]);
  const [priceFilteredCards, setPriceFilteredCards] = useState<Card[]>([]);
  const [sortedCards, setSortedCards] = useState<Card[]>([]);
  const [collectionFilteredCards, setCollectionFilteredCards] = useState<Card[]>([]);
  const [groupedCards, setGroupedCards] = useState<(Card | PokemonWithoutCard | PokemonFormWithoutCard)[]>([]);
  const [visibleCards, setVisibleCards] = useState<(Card | PokemonWithoutCard | PokemonFormWithoutCard)[]>([]);
  const [sets, setSets] = useState<Set[]>([]);
  const [seriesSelection, setSeriesSelection] = useState<SeriesSelection>(() => {
    const initialSeries = initializeFiltersFromUrl().series || [];
    return {
      included: initialSeries.filter((series) => series !== 'All'),
      excluded: [],
    };
  });

  // ========== Filter States ==========
  const [variantsFilter, setVariantsFilter] = useState<string[]>(["All"]);
  const [conditionsFilter, setConditionsFilter] = useState<string[]>(["All"]);
  const [priceRange, setPriceRange] = useState<{ min: number | null; max: number | null }>({ min: null, max: null });

  const [collectionFilter, setCollectionFilter] = useState<CollectionFilterOptions>(() => {
    const initialFilters = initializeFiltersFromUrl();
    return {
      enabled: initialFilters.filterByCollections === "true",
      mode: (initialFilters.viewCollectionOption || "none") as CollectionFilterOptions["mode"],
      selectedCollections: initialFilters.collections || [],
      limit: Number(initialFilters.limit || "1"),
      conditionsFilter: initialFilters.conditions?.length
        ? initialFilters.conditions
        : ["All"],
    };
  });

  const [pokemonGrouping, setPokemonGrouping] = useState<PokemonGroupingOptions>({
    enabled: false,
    filterByCollection: 'all',
    groupingRegions: ["All"],
    allowVariants: ['Default'],
    hideVariants: [],
    groupSortBy: 'default',
    fallbackToDefault: false
  });

  const [pokemonFormsData, setPokemonFormsData] = useState<PokemonFormData[]>([]);

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'number',
    direction: 'asc'
  });

  const [viewOptions, setViewOptions] = useState<ViewOptions>({
    displayMode: 'cardsUngrouped',
  });

  return (
    <CardContext.Provider
      value={useMemo(() => ({
        // Card Data States
        allCards,
        setAllCards,
        filteredCards,
        setFilteredCards,
        priceFilteredCards,
        setPriceFilteredCards,
        sortedCards,
        setSortedCards,
        collectionFilteredCards,
        setCollectionFilteredCards,
        groupedCards,
        setGroupedCards,
        visibleCards,
        setVisibleCards,

        // Sets Data
        sets,
        setSets,
        seriesSelection,
        setSeriesSelection,

        // Filter States
        variantsFilter,
        setVariantsFilter,
        conditionsFilter,
        setConditionsFilter,
        priceRange,
        setPriceRange,
        collectionFilter,
        setCollectionFilter,
        pokemonGrouping,
        setPokemonGrouping,
        pokemonFormsData,
        setPokemonFormsData,
        sortConfig,
        setSortConfig,
        viewOptions,
        setViewOptions
      }), [
        allCards, filteredCards, priceFilteredCards, sortedCards,
        collectionFilteredCards, groupedCards, visibleCards, sets, seriesSelection,
        variantsFilter, conditionsFilter, priceRange,
        collectionFilter, pokemonGrouping, pokemonFormsData,
        sortConfig, viewOptions
      ])}
    >
      {children}
    </CardContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCardContext = () => {
  const context = useContext(CardContext);
  if (context === undefined) {
    throw new Error("useCardContext must be used within a CardProvider");
  }
  return context;
};
