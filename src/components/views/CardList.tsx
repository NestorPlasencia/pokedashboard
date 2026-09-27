import { useWishlists } from "../../context/WishlistsContext";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { CardView } from "./CardView";
import { TrendCardView } from "./TrendCardView";
import { useCardContext } from "../../context/CardContext";
import { Card, PokemonFormData, PokemonFormWithoutCard } from "../../types/dashboard";
import { CardGroup } from "./CardGroup";
import { SeriesStarter } from "./SeriesStarter";
import { groupCardsByForm, sliceFormGroups, shouldIncludePokemonForm } from "../../utils/filters";
import { formBelongsToRegions } from "../../utils/pokedexRegions";
import { orderPokedexGroupNames } from "../../utils/pokedexGroupOrder";
import { useOptionsContext } from "../../context/OptionsContext";
import { collectionScopeNames } from "../../utils/collectionTree";

const CardListComponent: React.FC = () => {
  const {
    renderCards,
    pokemonGrouping,
    collectionFilter,
    pokemonFormsData,
    seriesSelection,
    viewOptions,
    viewMode
  } = useCardContext();
  const { collections } = useOptionsContext();
  const selectedCollectionNames = useMemo(() => [...new Set(
    collectionFilter.selectedCollections.flatMap((name) => collectionScopeNames(collections, name))
  )], [collectionFilter.selectedCollections, collections]);

  const [displayedCards, setDisplayedCards] = useState<Card[]>([]);
  const [displayedFormGroups, setDisplayedFormGroups] = useState<Record<string, { form: PokemonFormData; cards: (Card | PokemonFormWithoutCard)[] }>>({});
  const [itemsToShow, setItemsToShow] = useState<number>(20);

  const wishlists = useWishlists();
  // Grouping by Pokémon form only applies to the catalog; the other two modes render the
  // exact set of cards they scope to.
  // Collection views already scope renderCards to the active collection, so grouping
  // these cards cannot leak groups from the full catalog.
  const isFormsGrouping =
    pokemonGrouping.enabled && (viewMode.kind === 'catalog' || viewMode.kind === 'collection');

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
      filtered = pokemonFormsData.filter(form => formBelongsToRegions(form, pokemonGrouping.groupingRegions));
    }
    return filtered.filter(form =>
      !pokemonGrouping.excludedFormIds.includes(form.id) &&
      shouldIncludePokemonForm(form, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants)
    ).sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  }, [isFormsGrouping, pokemonFormsData, pokemonGrouping.groupingRegions, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants, pokemonGrouping.excludedFormIds]);

  // Memoize grouped cards by form
  const groupedCardsByForm = useMemo(() => {
    if (!isFormsGrouping || !renderCards || renderCards.length === 0) {
      return null;
    }
    return groupCardsByForm(
      renderCards as (Card | PokemonFormWithoutCard)[],
      formsToShow,
      selectedCollectionNames,
      pokemonGrouping.filterByCollection
    );
  }, [
    isFormsGrouping,
    renderCards,
    formsToShow,
    selectedCollectionNames,
    pokemonGrouping.filterByCollection
  ]);

  const orderedGroupNames = useMemo(() => {
    if (!isFormsGrouping || !groupedCardsByForm) return [];
    return orderPokedexGroupNames(formsToShow, groupedCardsByForm, pokemonGrouping.groupSortBy, selectedCollectionNames);
  }, [isFormsGrouping, groupedCardsByForm, formsToShow, pokemonGrouping.groupSortBy,
    selectedCollectionNames]);

  // Sort the entire group universe before pagination, so later groups can move to the top.
  const memoizedDisplayedFormGroups = useMemo(() => {
    if (!isFormsGrouping || !groupedCardsByForm) {
      return {};
    }
    const ordered = Object.fromEntries(orderedGroupNames.map((name) => [name, groupedCardsByForm[name]]));
    return sliceFormGroups(ordered, itemsToShow);
  }, [isFormsGrouping, groupedCardsByForm, orderedGroupNames, itemsToShow]);

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

  // The paged groups already follow the selected group order.
  const formNamesToRender = useMemo(() => {
    if (!isFormsGrouping) return [];
    return orderedGroupNames.filter((name) => displayedFormGroups[name] !== undefined);
  }, [isFormsGrouping, orderedGroupNames, displayedFormGroups]);

  const isEmpty = renderCards.length === 0;
  const isAwaitingSeries =
    viewMode.kind === 'catalog' &&
    seriesSelection.included.length === 0 &&
    seriesSelection.excluded.length === 0;

  // Only a wishlist splits into titled sections; a collection renders as one flat list.
  const sections = useMemo(() => {
    if (!wishlists.viewing) return null;
    return wishlists.groupCards(displayedCards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishlists.viewing, wishlists.wishlist, wishlists.subcollection, displayedCards]);

  return (
    <div className={`card-list${viewOptions.displayMode.includes('trend') ? ' card-list--trend' : ''}`}>
      {isEmpty && (
        isAwaitingSeries ? (
          <div className="card-list-empty card-list-empty--starter">
            <SeriesStarter />
          </div>
        ) : (
          <div className="card-list-empty">No cards match your current filters.</div>
        )
      )}
      {isFormsGrouping &&
        formNamesToRender.map(formName => {
          const group = displayedFormGroups[formName];
          if (!group) return null;
          return (
            <CardGroup key={formName} cards={group.cards} groupName={group.form.name} groupImage={group.form.image} />
          );
        })}
      {!isFormsGrouping && (sections
        ? sections.map(group => (
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
