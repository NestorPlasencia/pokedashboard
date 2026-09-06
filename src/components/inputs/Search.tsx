import { Search as SearchIcon, X } from "lucide-react";
import { cardKey } from "../../services/wishlists";
import { useMemo } from "react";
import { useWishlists } from "../../context/WishlistsContext";
import { ViewModeBadge } from "../ui/Wishlists";
import { EditTargetBadge } from "../ui/EditTargetBadge";
import React, { useEffect, useState, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { parseUrlParams, updateUrlParams } from "../../utils/urlParams";
import { assertNeverViewMode } from "../../utils/viewMode";
import { applySorting, applyPriceFilter, applyCollectionFilter } from "../../utils/filters";
import { Card } from "../../types/dashboard";

export const Search: React.FC = () => {
  // A search restored from the URL is applied on the first render, so a shared link
  // lands on the same result list it was copied from.
  const [query, setQuery] = useState<string>(() => parseUrlParams().search ?? "");
  const wishlists = useWishlists();
  const { groupedCards, sortedCards, allCards, visibleCards, setVisibleCards, sortConfig, variantsFilter, priceRange, conditionsFilter, collectionFilter, viewMode } = useCardContext();
  const sourceCards = useMemo(() => {
    switch (viewMode.kind) {
      case 'catalog':
        return groupedCards;
      case 'collection': {
        // sortedCards is the pipeline through price and sort but before the collection
        // filter, which is exactly "every filter except Collections". Scoping is by
        // ownership, so the collection filter would only fight the scope.
        const name = viewMode.name;
        return sortedCards.filter(c => c.collections?.some(entry => entry.name === name));
      }
      case 'wishlist': {
        // A wishlist starts from allCards instead, skipping the catalog's Level 1 filters
        // (set, rarity, type…) so a saved card never vanishes for an unrelated reason.
        // Price, sort and the collection filter do apply - the last one dims and hides.
        const savedCards = allCards.filter(c => wishlists.keys.has(cardKey({ id: c.id, era: c.setSeries })));
        const priceFiltered = applyPriceFilter(savedCards, priceRange.min, priceRange.max, variantsFilter, conditionsFilter);
        const sorted = applySorting(priceFiltered, sortConfig.field, sortConfig.direction, variantsFilter);
        return applyCollectionFilter(
          sorted,
          collectionFilter.enabled ? collectionFilter.mode : 'none',
          collectionFilter.selectedCollections,
          collectionFilter.limit,
          collectionFilter.conditionsFilter
        );
      }
      default:
        return assertNeverViewMode(viewMode);
    }
  }, [
    viewMode, sortedCards,
    wishlists.keys, allCards, groupedCards,
    priceRange.min, priceRange.max, conditionsFilter,
    sortConfig.field, sortConfig.direction, variantsFilter,
    collectionFilter.enabled, collectionFilter.mode, collectionFilter.selectedCollections,
    collectionFilter.limit, collectionFilter.conditionsFilter,
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

  useEffect(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const result = sourceCards.filter(card => {
      if (!normalized) return true;
      if ('isPlaceholder' in card) {
        const number = 'pokedexNumber' in card ? card.pokedexNumber : card.pokemonNumber;
        return card.name.toLocaleLowerCase().includes(normalized) || String(number).includes(normalized);
      }
      const actual = card as Card;
      return [actual.name, actual.id, actual.setName, actual.number, ...(actual.setNames || [])]
        .some(value => value?.toLocaleLowerCase().includes(normalized));
    });
    setVisibleCards(result);
  }, [sourceCards, query, setVisibleCards]);

  return (
    <div className="search-bar" ref={barRef}>
      {/* One grid cell, not two. The search bar is a three-column grid whose middle
          column is taken out of the flow on mobile, so a fourth child pushes an item onto
          a second row and overflows the viewport. */}
      <div className="search-bar__modes">
        <ViewModeBadge />
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
      <span className="search-item-count" aria-live="polite" aria-label={`${itemCount} cards shown`}>
        {itemCount.toLocaleString()}
      </span>
    </div>
  );
};
