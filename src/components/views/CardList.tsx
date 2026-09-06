import { useWishlists } from "../../context/WishlistsContext";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { CardView } from "./CardView";
import { TrendCardView } from "./TrendCardView";
import { useCardContext } from "../../context/CardContext";
import { Card, PokemonFormData, PokemonFormWithoutCard } from "../../types/dashboard";
import { CardGroup } from "./CardGroup";
import { groupCardsByForm, sliceFormGroups, shouldIncludePokemonForm } from "../../utils/filters";

const CardListComponent: React.FC = () => {
  const {
    renderCards,
    pokemonGrouping,
    collectionFilter,
    pokemonFormsData,
    seriesSelection,
    setSeriesSelection,
    sets,
    viewOptions
  } = useCardContext();

  const [displayedCards, setDisplayedCards] = useState<Card[]>([]);
  const [displayedFormGroups, setDisplayedFormGroups] = useState<Record<string, { form: PokemonFormData; cards: (Card | PokemonFormWithoutCard)[] }>>({});
  const [itemsToShow, setItemsToShow] = useState<number>(20);

  const wishlists = useWishlists();
  const isFormsGrouping = pokemonGrouping.enabled && !wishlists.viewing;

  const availableSeries = useMemo(
    () => Array.from(new Set(sets.map((set) => set.series).filter(Boolean))),
    [sets]
  );

  // Memoize filtered actual cards (without placeholders)
  const actualCards = useMemo(() => {
    if (!renderCards || renderCards.length === 0) return [];
    return renderCards.filter(card => !('isPlaceholder' in card)) as Card[];
  }, [renderCards]);

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
    if (!isFormsGrouping || !renderCards || renderCards.length === 0) {
      return null;
    }
    return groupCardsByForm(
      renderCards as (Card | PokemonFormWithoutCard)[],
      formsToShow,
      collectionFilter.selectedCollections,
      pokemonGrouping.filterByCollection
    );
  }, [
    isFormsGrouping,
    renderCards,
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

  const isEmpty = renderCards.length === 0;
  const isAwaitingSeries = seriesSelection.included.length === 0 && seriesSelection.excluded.length === 0;

  return (
    <div className={`card-list${viewOptions.displayMode.includes('trend') ? ' card-list--trend' : ''}`}>
      {isEmpty && (
        <div className="card-list-empty">
          {isAwaitingSeries ? (
            <>
              <p className="series-starter__title">Select a series to start exploring cards.</p>
              <div className="series-starter">
                <div className="series-starter__options" aria-label="Select a Pokémon card series">
                  {availableSeries.map((series) => (
                    <button
                      key={series}
                      type="button"
                      onClick={() => setSeriesSelection({ included: [series], excluded: [] })}
                    >
                      {series}
                    </button>
                  ))}
                </div>
                <p className="series-starter__hint">
                  Want to select more than one series? Open the Filters panel to build a multi-series selection.
                </p>
              </div>
            </>
          ) : 'No cards match your current filters.'}
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
      {!isFormsGrouping && (wishlists.viewing
        ? wishlists.groupCards(displayedCards).map(group => (
          <section className="wishlist-section" key={group.label}>
            <h3 className="wishlist-section__title">{group.label}<span className="wishlist-section__count">{group.cards.length}</span></h3>
            <div className={`wishlist-section__cards${viewOptions.displayMode.includes('trend') ? ' wishlist-section__cards--trend' : ''}`}>
              {group.cards.map((card, index) => viewOptions.displayMode.includes('trend')
                ? <TrendCardView key={`${card.id}-${index}`} card={card} />
                : <CardView key={`${card.id}-${index}`} card={card} />)}
            </div>
          </section>
        ))
        : displayedCards.map((card, index) => viewOptions.displayMode.includes('trend')
          ? <TrendCardView key={`${card.id}-${index}`} card={card} />
          : <CardView key={`${card.id}-${index}`} card={card} />))}
      <div id="sentinel" className="card-list-sentinel" />
    </div>
  );
};

export const CardList = React.memo(CardListComponent);
