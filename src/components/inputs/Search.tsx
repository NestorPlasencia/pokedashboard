import { Search as SearchIcon, X } from "lucide-react";
import { cardKey } from "../../services/wishlists";
import { useMemo } from "react";
import { useWishlists } from "../../context/WishlistsContext";
import { ViewModeBadge } from "../ui/Wishlists";
import { EditTargetBadge } from "../ui/EditTargetBadge";
import { SortMenu } from "../ui/SortMenu";
import React, { useDeferredValue, useEffect, useState, useRef } from "react";
import { useCardContext, type ActiveFilterChip } from "../../context/CardContext";
import { useOptionsContext } from "../../context/OptionsContext";
import { collectionScopeNames } from "../../utils/collectionTree";
import { parseUrlParams, updateUrlParams } from "../../utils/urlParams";
import { assertNeverViewMode } from "../../utils/viewMode";
import { applySorting, applyPriceFilter, applyCollectionFilter, applyFormsFilter } from "../../utils/filters";
import { Card } from "../../types/dashboard";
import type { CollectionEnrichment } from "../../hooks/useLoadCards";
import { countCopies } from "../../utils/copyCount";

type SearchProps = {
  /** How far the viewed collection has been matched to the external catalog. */
  collectionEnrichment?: CollectionEnrichment;
};

export const Search: React.FC<SearchProps> = ({ collectionEnrichment }) => {
  // A search restored from the URL is applied on the first render, so a shared link
  // lands on the same result list it was copied from.
  const [query, setQuery] = useState<string>(() => parseUrlParams().search ?? "");
  const wishlists = useWishlists();
  const { collections } = useOptionsContext();
  const {
    groupedCards, sortedCards, allCards, visibleCards, setVisibleCards, sortConfig, variantsFilter,
    priceRange, setPriceRange, conditionsFilter, collectionFilter, setCollectionFilter,
    pokemonGrouping, pokemonFormsData, viewMode, activeFilterChips,
  } = useCardContext();
  // A marked collection stands for its subcollections too, the same way a viewed one
  // does. Expanded here rather than when the box is ticked, so the stored selection - and
  // the URL built from it - stays exactly what was chosen.
  const scopedCollections = useMemo(
    () => [...new Set(
      collectionFilter.selectedCollections.flatMap((name) => collectionScopeNames(collections, name))
    )],
    [collections, collectionFilter.selectedCollections]
  );
  const sourceCards = useMemo(() => {
    switch (viewMode.kind) {
      case 'catalog':
        return groupedCards;
      case 'collection': {
        // First scope to the collections being viewed (their union, each including its own
        // subcollections), then apply any marked collection as a second ownership filter.
        // Thus Hide not owned is an intersection, not a replacement of the view: viewed
        // collections ∩ selection.
        const names = new Set(viewMode.names.flatMap((name) => collectionScopeNames(collections, name)));
        const scopedCards = sortedCards.filter(card => card.collections?.some(entry =>
          names.has(entry.name) && countCopies(entry.quantity, collectionFilter.conditionsFilter) > 0
        ));
        const ownershipFiltered = applyCollectionFilter(
          scopedCards,
          scopedCollections.length > 0 ? collectionFilter.mode : 'none',
          scopedCollections,
          collectionFilter.limit,
          ['All']
        );
        // Grouping runs last, on the scoped cards, so the Pokémon missing from this
        // collection show up as placeholders just as they do in the catalog.
        if (!pokemonGrouping.enabled || ownershipFiltered.length === 0) return ownershipFiltered;
        return applyFormsFilter(ownershipFiltered, pokemonFormsData, {
          filterByCollection: pokemonGrouping.filterByCollection,
          groupingRegions: pokemonGrouping.groupingRegions,
          allowVariants: pokemonGrouping.allowVariants,
          hideVariants: pokemonGrouping.hideVariants,
          selectedCollections: scopedCollections,
          collectionMode: collectionFilter.mode,
          fallbackToDefault: pokemonGrouping.fallbackToDefault,
        });
      }
      case 'wishlist': {
        // A wishlist starts from allCards instead, skipping the catalog's Level 1 filters
        // (set, rarity, type…) so a saved card never vanishes for an unrelated reason.
        // Price, sort and the collection filter do apply - the last one dims and hides.
        const savedCards = allCards.filter(c => wishlists.keys.has(cardKey({
          id: c.id,
          era: c.setSeries,
          productId: c.productId,
          printing: c.printing || c.variant || null,
        })));
        const priceFiltered = applyPriceFilter(savedCards, priceRange.min, priceRange.max, variantsFilter, conditionsFilter);
        const sorted = applySorting(priceFiltered, sortConfig.field, sortConfig.direction, variantsFilter);
        return applyCollectionFilter(
          sorted,
          scopedCollections.length > 0 ? collectionFilter.mode : 'none',
          scopedCollections,
          collectionFilter.limit,
          ['All']
        );
      }
      default:
        return assertNeverViewMode(viewMode);
    }
  }, [
    viewMode, sortedCards, collections,
    wishlists.keys, allCards, groupedCards,
    priceRange.min, priceRange.max, conditionsFilter,
    sortConfig.field, sortConfig.direction, variantsFilter,
    collectionFilter.mode, scopedCollections,
    collectionFilter.limit, collectionFilter.conditionsFilter,
    pokemonGrouping, pokemonFormsData,
  ]);
  // Leaving or entering a wishlist changes what is on screen, so the query starts over.
  const isViewingWishlist = viewMode.kind === 'wishlist';
  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) setQuery('');
    didMount.current = true;
  }, [isViewingWishlist]);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** The panel that scrolls, reached from inside rather than by a global lookup. */
  const listPanel = () => barRef.current?.closest('.card-view') ?? null;

  // Opening the on-screen keyboard shrinks the viewport, and the browser scrolls the list
  // to keep the focused field in view. The field is pinned to the bottom on mobile, so
  // that scroll pushes the results off the top - the ones the search just found. Putting
  // the list back on every viewport resize while the field has focus beats the browser to
  // it, however many times it adjusts as the keyboard animates in.
  //
  // Note this is the only thing that moves the list. Resetting on every change of the
  // query looks reasonable and is not: the results update as you type, so it yanks the
  // list back mid-scroll while you are still refining a search.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const keepResultsInView = () => {
      if (document.activeElement !== inputRef.current) return;
      listPanel()?.scrollTo({ top: 0 });
    };
    viewport.addEventListener('resize', keepResultsInView);
    return () => viewport.removeEventListener('resize', keepResultsInView);
  }, []);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleClear = () => setQuery("");

  const itemCount = visibleCards.filter((card) => !('isPlaceholder' in card)).length;

  // Sincronizar URL con debounce
  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    debounceTimeout.current = setTimeout(() => {
      if (query.length > 0) {
        updateUrlParams({ search: query });
      } else {
        updateUrlParams({ search: undefined });
      }
    }, 500);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [query]);

  // One lowercased haystack per card, rebuilt only when the card list itself changes.
  // Doing this inside the filter meant every keystroke allocated an array per card and ran
  // locale-aware lowercasing over every field of every card - the reason typing stuttered.
  // The newline separator keeps fields from matching across their boundary; a trimmed
  // single-line query can never contain one.
  const searchIndex = useMemo(
    () => sourceCards.map(card => {
      if ('isPlaceholder' in card) {
        const number = 'pokedexNumber' in card ? card.pokedexNumber : card.pokemonNumber;
        return `${card.name}\n${number}`.toLocaleLowerCase();
      }
      const actual = card as Card;
      return [actual.name, actual.id, actual.setName, actual.number, ...(actual.setNames || [])]
        .filter(Boolean).join('\n').toLocaleLowerCase();
    }),
    [sourceCards]
  );

  // Filtering thousands of cards is far too slow to hold up a keypress. Deferring it lets
  // React paint the typed character first and rebuild the list at a lower priority, so the
  // field never lags behind the keyboard.
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase();
    // An empty query is every card, so filtering would copy the whole list to reach the
    // list it started from. Handing back the same reference also lets React skip the
    // re-render entirely - this is the case that stalled when deleting the last character.
    setVisibleCards(
      normalized
        ? sourceCards.filter((_, index) => searchIndex[index].includes(normalized))
        : sourceCards
    );
  }, [sourceCards, searchIndex, deferredQuery, setVisibleCards]);

  // Price range and the collections filter apply everywhere, wishlist included, so they
  // get their own chips independent of the ones Filters.tsx publishes for its own panel.
  const priceChips: ActiveFilterChip[] = useMemo(() => {
    if (priceRange.min === null && priceRange.max === null) return [];
    const label = priceRange.min !== null && priceRange.max !== null
      ? `Price: $${priceRange.min} – $${priceRange.max}`
      : priceRange.min !== null
        ? `Price: from $${priceRange.min}`
        : `Price: up to $${priceRange.max}`;
    return [{ id: 'price-range', label, onRemove: () => setPriceRange({ min: null, max: null }) }];
  }, [priceRange, setPriceRange]);

  const collectionChips: ActiveFilterChip[] = useMemo(
    () => collectionFilter.selectedCollections.map((name) => ({
      id: `collection-${name}`,
      label: `Collection: ${name}`,
      onRemove: () => setCollectionFilter((prev) => {
        const selectedCollections = prev.selectedCollections.filter((entry) => entry !== name);
        return { ...prev, enabled: selectedCollections.length > 0, selectedCollections };
      }),
    })),
    [collectionFilter.selectedCollections, setCollectionFilter]
  );

  // Rarity, Type, Variant… only narrow the catalog and collection views - a wishlist skips
  // them entirely (Search starts from every saved card instead), so they stay out of its row.
  const allActiveChips = useMemo(
    () => [...(viewMode.kind !== 'wishlist' ? activeFilterChips : []), ...collectionChips, ...priceChips],
    [viewMode.kind, activeFilterChips, collectionChips, priceChips]
  );
  const showActiveFilterChips = allActiveChips.length > 0;

  return (
    <>
      <div className="search-bar" ref={barRef}>
        {/* One grid cell, not two. The search bar is a three-column grid whose middle
            column is taken out of the flow on mobile, so a fourth child pushes an item onto
            a second row and overflows the viewport. */}
        <div className="search-bar__modes">
          <ViewModeBadge />
          {collectionEnrichment?.status === 'loading' && (
            <span
              className="collection-progress"
              role="status"
              title={`Matching catalog data: ${collectionEnrichment.matched} of ${collectionEnrichment.total} cards`}
            >
              <span className="collection-progress__spinner" aria-hidden="true" />
              {collectionEnrichment.matched}/{collectionEnrichment.total}
            </span>
          )}
          <EditTargetBadge />
        </div>
        <div className="search-field">
          <SearchIcon className="search-field__icon" size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => listPanel()?.scrollTo({ top: 0 })}
            placeholder="Search"
            aria-label="Search by card name"
          />
          {query && (
            <button
              type="button"
              className="search-clear-button"
              onClick={handleClear}
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="search-bar__end">
          <SortMenu />
          <span className="search-item-count" aria-live="polite" aria-label={`${itemCount} cards shown`}>
            {itemCount.toLocaleString()}
          </span>
        </div>
      </div>
      {showActiveFilterChips && (
        <div className="active-filters-row" role="group" aria-label="Active filters">
          {allActiveChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="active-filters-row__chip"
              onClick={chip.onRemove}
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label} <X size={11} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </>
  );
};
