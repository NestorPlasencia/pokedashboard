import { Search as SearchIcon, X } from "lucide-react";
import { cardKey } from "../../services/wishlists";
import { useMemo } from "react";
import { useWishlists } from "../../context/WishlistsContext";
import { ViewModeBadge } from "../ui/Wishlists";
import React, { useEffect, useState, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { updateUrlParams } from "../../utils/urlParams";
import { applySorting, applyPriceFilter, applyCollectionFilter } from "../../utils/filters";
import { Card } from "../../types/dashboard";

export const Search: React.FC = () => {
  const [query, setQuery] = useState<string>("");
  const wishlists = useWishlists();
  const { groupedCards, allCards, visibleCards, setVisibleCards, sortConfig, variantsFilter, priceRange, conditionsFilter, collectionFilter } = useCardContext();
  // A wishlist deliberately skips the catalog's Level 1 filters (set, rarity, type…) so
  // saved cards never disappear, but price, sort and the collection filter still apply -
  // the latter is what dims, hides and counts owned copies.
  const sourceCards = useMemo(() => {
    if (!wishlists.viewing) return groupedCards;
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
  }, [
    wishlists.viewing, wishlists.keys, allCards, groupedCards,
    priceRange.min, priceRange.max, conditionsFilter,
    sortConfig.field, sortConfig.direction, variantsFilter,
    collectionFilter.enabled, collectionFilter.mode, collectionFilter.selectedCollections,
    collectionFilter.limit, collectionFilter.conditionsFilter,
  ]);
  useEffect(() => { setQuery(''); }, [wishlists.viewing]);
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
