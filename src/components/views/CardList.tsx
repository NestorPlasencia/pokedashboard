import React, { useEffect, useState, useMemo, useCallback } from "react";
import { CardView } from "./CardView";
import { useCardContext } from "../../context/CardContext";
import { useOptionsContext } from "../../context/OptionsContext";
import { Card, PokemonFormData, PokemonFormWithoutCard } from "../../types/dashboard";
import { CardGroup } from "./CardGroup";
import { groupCardsByForm, sliceFormGroups, shouldIncludePokemonForm } from "../../utils/filters";

const CardListComponent: React.FC = () => {
  const { visibleCards, pokemonGrouping, collectionFilter, pokemonFormsData, allCards, filteredCards } = useCardContext();
  const { } = useOptionsContext();

  const [displayedCards, setDisplayedCards] = useState<Card[]>([]);
  const [displayedFormGroups, setDisplayedFormGroups] = useState<Record<string, { form: PokemonFormData; cards: (Card | PokemonFormWithoutCard)[] }>>({});
  const [itemsToShow, setItemsToShow] = useState<number>(20);

  const isFormsGrouping = pokemonGrouping.enabled;

  // Memoize filtered actual cards (without placeholders)
  const actualCards = useMemo(() => {
    if (!visibleCards || visibleCards.length === 0) return [];
    return visibleCards.filter(card => !('isPlaceholder' in card)) as Card[];
  }, [visibleCards]);

  // Memoize forms to show based on filter settings
  const formsToShow = useMemo(() => {
    if (!isFormsGrouping) return [];
    let filtered = pokemonFormsData;
    if (pokemonGrouping.groupingRegions.length > 0 && !pokemonGrouping.groupingRegions.includes('All')) {
      filtered = pokemonFormsData.filter(form =>
        form.regions.some(r => pokemonGrouping.groupingRegions.includes(r.region.name))
      );
    }
    return filtered.filter(form =>
      shouldIncludePokemonForm(form, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants)
    );
  }, [isFormsGrouping, pokemonFormsData, pokemonGrouping.groupingRegions, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants]);

  // Memoize grouped cards by form
  const groupedCardsByForm = useMemo(() => {
    if (!isFormsGrouping || !visibleCards || visibleCards.length === 0) {
      return null;
    }
    return groupCardsByForm(
      visibleCards as (Card | PokemonFormWithoutCard)[],
      formsToShow,
      collectionFilter.selectedCollections,
      pokemonGrouping.filterByCollection
    );
  }, [
    isFormsGrouping,
    visibleCards,
    formsToShow,
    collectionFilter.selectedCollections,
    pokemonGrouping.filterByCollection
  ]);

  // Memoize displayed form groups
  const memoizedDisplayedFormGroups = useMemo(() => {
    if (!isFormsGrouping || !groupedCardsByForm) {
      return {};
    }
    return sliceFormGroups(groupedCardsByForm, itemsToShow);
  }, [isFormsGrouping, groupedCardsByForm, itemsToShow]);

  // Memoize displayed cards (ungrouped)
  const memoizedDisplayedCards = useMemo(() => {
    if (isFormsGrouping) return [];
    return actualCards.slice(0, itemsToShow);
  }, [isFormsGrouping, actualCards, itemsToShow]);

  useEffect(() => {
    if (isFormsGrouping) {
      setDisplayedFormGroups(memoizedDisplayedFormGroups);
    } else {
      setDisplayedCards(memoizedDisplayedCards);
    }
  }, [isFormsGrouping, memoizedDisplayedFormGroups, memoizedDisplayedCards]);

  // Memoize the load more callback
  const handleLoadMore = useCallback(() => {
    setItemsToShow((prev) => prev + 100);
  }, []);

  useEffect(() => {
    // Find the scrollable parent container (.card-view)
    const sentinel = document.querySelector('#sentinel');
    const scrollContainer = sentinel?.closest('.card-view');
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { 
        root: scrollContainer as Element,
        threshold: 0.1,
        rootMargin: '200px'
      }
    );
    
    if (sentinel) {
      observer.observe(sentinel);
    }
    return () => observer.disconnect();
  }, [handleLoadMore]);

  // Memoize filtered pokedex numbers for rendering — removed (pokedex mode eliminated)

  // Memoize form names to render (preserve insertion order from formsToShow, optionally sorted by card count)
  const formNamesToRender = useMemo(() => {
    if (!isFormsGrouping) return [];
    const names = formsToShow
      .map(f => f.name)
      .filter(name => displayedFormGroups[name] !== undefined);

    if (pokemonGrouping.groupSortBy === 'cardCount' || pokemonGrouping.groupSortBy === 'cardCountDesc') {
      const dir = pokemonGrouping.groupSortBy === 'cardCount' ? 1 : -1;
      names.sort((a, b) => {
        const countA = displayedFormGroups[a]?.cards.filter(c => !('isPlaceholder' in c)).length ?? 0;
        const countB = displayedFormGroups[b]?.cards.filter(c => !('isPlaceholder' in c)).length ?? 0;
        return (countA - countB) * dir;
      });
    } else if (pokemonGrouping.groupSortBy === 'ownedCount' || pokemonGrouping.groupSortBy === 'ownedCountDesc') {
      const dir = pokemonGrouping.groupSortBy === 'ownedCount' ? 1 : -1;
      names.sort((a, b) => {
        const nonShadowA = (displayedFormGroups[a]?.cards.filter(c => !('isPlaceholder' in c) && !(c as Card).shadow).length) ?? 0;
        const nonShadowB = (displayedFormGroups[b]?.cards.filter(c => !('isPlaceholder' in c) && !(c as Card).shadow).length) ?? 0;
        return (nonShadowA - nonShadowB) * dir;
      });
    }

    return names;
  }, [isFormsGrouping, formsToShow, displayedFormGroups, pokemonGrouping.groupSortBy]);

  const isEmpty = visibleCards.length === 0;
  const isAwaitingSeries = allCards.length > 0 && filteredCards.length === 0;

  return (
    <div className="card-list">
      {isEmpty && (
        <div className="card-list-empty">
          {isAwaitingSeries ? 'Selecciona una serie para ver las cartas' : 'No hay cartas para mostrar'}
        </div>
      )}
      {isFormsGrouping &&
        formNamesToRender.map(formName => {
          const group = displayedFormGroups[formName];
          if (!group) return null;
          return (
            <CardGroup key={formName} cards={group.cards} groupName={group.form.name} groupImage={group.form.image} />
          );
        })}
      {!isFormsGrouping &&
        displayedCards.map((card, index) => <CardView key={`${card.id}-${index}`} card={card} />)}
      <div id="sentinel" className="card-list-sentinel" />
    </div>
  );
};

export const CardList = React.memo(CardListComponent);
