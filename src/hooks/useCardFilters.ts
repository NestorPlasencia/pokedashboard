import { useEffect, useMemo } from 'react';
import { useCardContext } from '../context/CardContext';
import { 
  applyPriceFilter, 
  applySorting, 
  applyCollectionFilter, 
  applyFormsFilter
} from '../utils/filters';

/**
 * Hook to manage the hierarchical filtering cascade
 * Level 1 (basic filters) is handled by Filters.tsx component
 * This hook handles Levels 2-6 (price, sort, collection, pokemon grouping, visible)
 * 
 * Uses useMemo chain instead of useEffect waterfall to avoid cascading re-renders.
 * All levels compute synchronously in a single render pass.
 */
export const useCardFilters = () => {
  const {
    filteredCards,
    setPriceFilteredCards,
    setSortedCards,
    setCollectionFilteredCards,
    setGroupedCards,
    setVisibleCards,
    variantsFilter,
    conditionsFilter,
    priceRange,
    collectionFilter,
    pokemonGrouping,
    pokemonFormsData,
    sortConfig
  } = useCardContext();

  // NOTE: Level 1 (basic filters) is handled by Filters.tsx component
  // This hook starts from Level 2 (price filter)

  // Level 2: Apply price range filter
  const priceFilteredCards = useMemo(() => {
    if (filteredCards.length === 0) return [];
    return applyPriceFilter(
      filteredCards,
      priceRange.min,
      priceRange.max,
      variantsFilter,
      conditionsFilter
    );
  }, [filteredCards, priceRange.min, priceRange.max, variantsFilter, conditionsFilter]);

  // Level 3: Apply sorting
  const sortedCards = useMemo(() => {
    if (priceFilteredCards.length === 0) return [];
    return applySorting(
      priceFilteredCards,
      sortConfig.field,
      sortConfig.direction,
      variantsFilter
    );
  }, [priceFilteredCards, sortConfig.field, sortConfig.direction, variantsFilter]);

  // Level 4: Apply collection filter (hide/shadow owned/not-owned)
  const collectionFilteredCards = useMemo(() => {
    if (sortedCards.length === 0) return [];
    return applyCollectionFilter(
      sortedCards,
      collectionFilter.enabled ? collectionFilter.mode : 'none',
      collectionFilter.selectedCollections,
      collectionFilter.limit,
      collectionFilter.conditionsFilter
    );
  }, [
    sortedCards,
    collectionFilter.enabled,
    collectionFilter.mode,
    collectionFilter.selectedCollections,
    collectionFilter.limit,
    collectionFilter.conditionsFilter
  ]);

  // Level 5: Apply Pokemon Grouping (Forms mode)
  const groupedCards = useMemo(() => {
    if (collectionFilteredCards.length === 0) return [];
    if (!pokemonGrouping.enabled) return collectionFilteredCards;
    return applyFormsFilter(
      collectionFilteredCards,
      pokemonFormsData,
      {
        filterByCollection: pokemonGrouping.filterByCollection,
        groupingRegions: pokemonGrouping.groupingRegions,
        allowVariants: pokemonGrouping.allowVariants,
        hideVariants: pokemonGrouping.hideVariants,
        selectedCollections: collectionFilter.selectedCollections,
        collectionMode: collectionFilter.mode,
        fallbackToDefault: pokemonGrouping.fallbackToDefault
      }
    );
  }, [
    collectionFilteredCards,
    pokemonGrouping.enabled,
    pokemonGrouping.filterByCollection,
    pokemonGrouping.groupingRegions,
    pokemonGrouping.allowVariants,
    pokemonGrouping.hideVariants,
    pokemonGrouping.fallbackToDefault,
    pokemonFormsData,
    collectionFilter.selectedCollections,
    collectionFilter.mode
  ]);

  // Sync computed values to context for other components to consume
  useEffect(() => {
    setPriceFilteredCards(priceFilteredCards);
  }, [priceFilteredCards, setPriceFilteredCards]);

  useEffect(() => {
    setSortedCards(sortedCards);
  }, [sortedCards, setSortedCards]);

  useEffect(() => {
    setCollectionFilteredCards(collectionFilteredCards);
  }, [collectionFilteredCards, setCollectionFilteredCards]);

  useEffect(() => {
    setGroupedCards(groupedCards);
  }, [groupedCards, setGroupedCards]);

  // Level 6: Store final cards (for search to use)
  useEffect(() => {
    setVisibleCards(groupedCards);
  }, [groupedCards, setVisibleCards]);

  return {
    priceFilteredCards,
    sortedCards,
    collectionFilteredCards,
    groupedCards
  };
};
