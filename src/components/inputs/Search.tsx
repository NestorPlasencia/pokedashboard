import { Search as SearchIcon, X } from "lucide-react";
import { cardKey } from "../../services/wishlists";
import { useMemo } from "react";
import { useWishlists } from "../../context/WishlistsContext";
import { ViewModeBadge } from "../ui/Wishlists";
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
    <div className="search-bar">
      <ViewModeBadge />
      <div className="search-field">
        <SearchIcon className="search-field__icon" size={16} aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
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
