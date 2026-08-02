import React, { useEffect, useState, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { updateUrlParams } from "../../utils/urlParams";
import { Card } from "../../types/dashboard";

export const Search: React.FC = () => {
  const [query, setQuery] = useState<string>("");
  const { groupedCards, setVisibleCards } = useCardContext();
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

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
    if (groupedCards && groupedCards.length > 0) {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        let visibleCards = [...groupedCards];
        
        // Apply search filter
        if (query.length >= 3) {
          visibleCards = visibleCards.filter(card => {
            // Handle both Card and PokemonWithoutCard
            if ('isPlaceholder' in card && card.isPlaceholder) {
              // Search in PokemonWithoutCard or PokemonFormWithoutCard
              const number = 'pokedexNumber' in card ? card.pokedexNumber : card.pokemonNumber;
              return card.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
                     number.toString().includes(query);
            } else {
              // Search in Card (with type guard)
              const actualCard = card as Card;
              const setNames = actualCard.setNames || [];
              return actualCard.name?.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
                     actualCard.id?.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
                     actualCard.setName?.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
                     setNames.some((setName) =>
                       setName.toLocaleLowerCase().includes(query.toLocaleLowerCase())
                     ) ||
                     actualCard.number?.toLocaleLowerCase().includes(query.toLocaleLowerCase());
            }
          });
        }
        
        setVisibleCards(visibleCards);
      }, 300);
    }
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [groupedCards, query, setVisibleCards]);

  return (
    <div className="search-bar">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder="Search by card name..."
        aria-label="Search by card name"
      />
    </div>
  );
};
