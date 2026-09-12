import { useEffect, useMemo } from 'react';
import { useCardContext } from '../context/CardContext';
import { useOptionsContext } from '../context/OptionsContext';
import { collectionScopeNames } from '../utils/collectionTree';
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
    variantsFilter,
    conditionsFilter,
    priceRange,
    collectionFilter,
    pokemonGrouping,
    pokemonFormsData,
    sortConfig,
    viewMode
  } = useCardContext();
  const { collections } = useOptionsContext();

  /**
   * Picking a collection means picking what it holds, subcollections included - the rule
   * the view mode and this panel's own condition counts already follow.
   *
   * The expansion happens here rather than when a box is ticked: the stored selection
   * stays exactly what the user chose, so the URL keeps their choice and a collection
   * nested later is picked up without rewriting the filter.
   */
  const scopedCollections = useMemo(
    () => [...new Set(
      collectionFilter.selectedCollections.flatMap((name) => collectionScopeNames(collections, name))
    )],
    [collections, collectionFilter.selectedCollections]
  );

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
      // Guarded on the scope rather than the raw selection: the scope is what the filter
      // actually reads, and the two are empty together.
      scopedCollections.length > 0 ? collectionFilter.mode : 'none',
      scopedCollections,
      collectionFilter.limit,
      // Condition belongs to a collection view, never to a hidden ownership filter.
      viewMode.kind === 'collection' ? collectionFilter.conditionsFilter : ['All']
    );
  }, [
    sortedCards,
    collectionFilter.mode,
    scopedCollections,
    collectionFilter.limit,
    collectionFilter.conditionsFilter,
    viewMode.kind
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
        selectedCollections: scopedCollections,
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
    scopedCollections,
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

  return {
    priceFilteredCards,
    sortedCards,
    collectionFilteredCards,
    groupedCards
  };
};
