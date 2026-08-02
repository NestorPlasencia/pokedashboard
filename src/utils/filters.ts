import type { Card, ConditionKey, PokemonWithoutCard, PokemonFormWithoutCard, PokemonFormData, Set } from "../types/dashboard";
const NON_HIT_RARITIES = ["Common", "Uncommon", "Rare", "Rare Holo"];
const NON_HOLO_RARITIES = ["Common", "Uncommon", "Rare"];
const BULK_RARITIES = ["Common", "Uncommon"];
const RARE_RARITIES = ["Rare"];
const HOLO_RARITIES = ["Rare Holo"];
const CONDITION_KEYS: ConditionKey[] = ["Near Mint", "Lightly Played", "Moderately Played", "Damaged", "Heavily Played"];

type FilterProperty = keyof Card | "variants" | "conditions";

const toLower = (value: string) => value.toLowerCase();

const getCardVariants = (card: Card): string[] => {
  const variants = [card.variant, card.cardVariantTopLevel].filter(Boolean) as string[];
  return variants.map(toLower);
};

const getCardPropertyValues = (card: Card, property: FilterProperty): string[] => {
  if (property === 'variants') {
    return getCardVariants(card);
  }
  if (property === 'setSeries') {
    return card.setSeriesNames && card.setSeriesNames.length > 0
      ? card.setSeriesNames
      : [card.setSeries];
  }
  if (property === 'pokedexRegion') {
    const fallbackRegion = card.nationalPokedexNumbers?.length
      ? getRegionForPokedexNumber(card.nationalPokedexNumbers[0])
      : null;
    const resolvedRegion = card.pokedexRegion || fallbackRegion;
    return resolvedRegion ? [resolvedRegion] : [];
  }
  const cardProperty = card[property as keyof Card];
  if (Array.isArray(cardProperty)) {
    return (cardProperty as unknown[]).map((it) => String(it));
  } else if (typeof cardProperty === "string" || typeof cardProperty === "number" || typeof cardProperty === "boolean") {
    return [String(cardProperty)];
  }
  return [];
};

export const excludeCardsByProperty = (
  data: Card[],
  property: FilterProperty,
  excluded: string[]
): Card[] => {
  if (excluded.length === 0) return data;

  const isVariants = property === 'variants';
  const normalizedExcluded = isVariants ? excluded.map(toLower) : excluded;

  return data.filter((card) => {
    const values = getCardPropertyValues(card, property);
    if (values.length === 0) return true;
    return !normalizedExcluded.some((ex) => values.includes(ex));
  });
};

const getConditionKeysToUse = (conditionsFilter: string[] = ["All"]): ConditionKey[] => {
  if (conditionsFilter.includes("All")) {
    return CONDITION_KEYS;
  }

  return conditionsFilter.filter((condition): condition is ConditionKey =>
    CONDITION_KEYS.includes(condition as ConditionKey)
  );
};

const sumConditionQuantity = (
  quantity: Partial<Record<ConditionKey, number>> | undefined,
  conditionsFilter: string[] = ["All"]
): number => {
  if (!quantity) {
    return 0;
  }

  const conditions = getConditionKeysToUse(conditionsFilter);
  return conditions.reduce((sum, condition) => sum + (quantity[condition] || 0), 0);
};

export const filterSeriesSets = (sets: Set[], series: string[]) => {
  return sets.filter((set) => series.includes(set.series));
};

export const filterCardsByProperty = (
  data: Card[],
  property: FilterProperty,
  checked: string[]
) => {
  if (checked.includes("All") && checked.length == 1) return data;
  
  // Filtrado especial para variants usando variant/cardVariantTopLevel
  if (property === 'variants') {
    const checkedVariants = checked.map(toLower);
    return data.filter((card) => {
      const variants = getCardVariants(card);
      if (variants.length === 0) return true;
      return checkedVariants.some((value) => variants.includes(value));
    });
  }

  if (property === 'conditions') {
    const conditionsToCheck = getConditionKeysToUse(checked);
    return data.filter((card) => {
      if (!card.prices) return false;
      return conditionsToCheck.some((condition) => {
        const price = card.prices[condition];
        return price !== null && price !== undefined;
      });
    });
  }

  if (property === 'setSeries') {
    return data.filter((card) => {
      if (checked.includes(card.setSeries)) {
        return true;
      }
      const seriesNames =
        card.setSeriesNames && card.setSeriesNames.length > 0
          ? card.setSeriesNames
          : [card.setSeries];
      return checked.some((value) => seriesNames.includes(value));
    });
  }

  if (property === 'pokedexRegion') {
    return data.filter((card) => {
      const fallbackRegion = card.nationalPokedexNumbers?.length
        ? getRegionForPokedexNumber(card.nationalPokedexNumbers[0])
        : null;
      const resolvedRegion = card.pokedexRegion || fallbackRegion;
      return !!resolvedRegion && checked.includes(resolvedRegion);
    });
  }
  
  return data.filter((card) => {
    const cardProperty = card[property as keyof Card];
    if (Array.isArray(cardProperty)) {
      const itemsAsStrings = (cardProperty as unknown[]).map((it) => String(it));
      return checked.some((value) => itemsAsStrings.includes(value));
    } else if (typeof cardProperty === "string" || typeof cardProperty === "number" || typeof cardProperty === "boolean") {
      return checked.includes(String(cardProperty));
    }
    return false;
  });
};

export const filterCardsByPokedexCompletion = (
  data: Card[],
  completionFilter: string[]
): Card[] => {
  if (completionFilter.includes("All") && completionFilter.length === 1) return data;

  // Group cards by Pokédex number
  const pokedexGroups: Record<number, Card[]> = {};
  data.forEach(card => {
    const pokedexNums = card.nationalPokedexNumbers || [];
    pokedexNums.forEach(num => {
      if (!pokedexGroups[num]) {
        pokedexGroups[num] = [];
      }
      pokedexGroups[num].push(card);
    });
  });

  // Determine which Pokédex numbers match the filter
  const matchingPokedexNums = new Set<number>();

  Object.entries(pokedexGroups).forEach(([pokedexStr, cards]) => {
    const pokedexNum = Number(pokedexStr);
    const hasAnyNonShadow = cards.some(card => !card.shadow);
    const hasAnyShadow = cards.some(card => card.shadow);

    if (completionFilter.includes("OnlyMissing")) {
      // Only Pokémon without any non-shadow cards (all cards are shadow or missing)
      if (!hasAnyNonShadow) {
        matchingPokedexNums.add(pokedexNum);
      }
    } else if (completionFilter.includes("OnlyIncomplete")) {
      // Only Pokémon with some missing cards (has both shadow and non-shadow)
      if (hasAnyNonShadow && hasAnyShadow) {
        matchingPokedexNums.add(pokedexNum);
      }
    }
  });

  // Filter cards to only those belonging to matching Pokédex numbers
  return data.filter(card => {
    const pokedexNums = card.nationalPokedexNumbers || [];
    return pokedexNums.some(num => matchingPokedexNums.has(num));
  });
};

export const filterCardsByPriceType = (cards: Card[], priceTypeFilter: string[]) => {
  if (priceTypeFilter.includes("All") || priceTypeFilter.includes("Ambos")) {
    return cards;
  }

  const normalizedFilter = priceTypeFilter.map(toLower);

  return cards.filter(card => {
    const hasPrice = Object.values(card.prices || {}).some(price => price !== null && price !== undefined);
    if (!hasPrice) {
      return false;
    }

    const cardVariants = getCardVariants(card);
    const hasStandardVariant = cardVariants.some((variant) => variant.includes("standard"));
    const hasReverseVariant = cardVariants.some(
      (variant) => variant.includes("reverse") || variant.includes("parallel")
    );

    if (normalizedFilter.includes("standard") && normalizedFilter.includes("reverse")) {
      return hasStandardVariant || hasReverseVariant;
    } else if (normalizedFilter.includes("standard")) {
      return hasStandardVariant;
    } else if (normalizedFilter.includes("reverse")) {
      return hasReverseVariant;
    }

    return true;
  });
};

export const filterCardsByPriceRange = (
  cards: Card[], 
  minPrice: number | null, 
  maxPrice: number | null,
  variantsFilter: string[] = ['All'],
  conditionsFilter: string[] = ['All']
) => {
  // If no price filter is set, return all cards
  if (minPrice === null && maxPrice === null) {
    return cards;
  }

  const shouldFilterByVariant = !variantsFilter.includes('All');
  const checkedVariants = variantsFilter.map(toLower);
  const conditionsToCheck = conditionsFilter.includes('All')
    ? (["Near Mint"] as ConditionKey[])
    : getConditionKeysToUse(conditionsFilter);

  const filtered = cards.filter(card => {
    if (shouldFilterByVariant) {
      const cardVariants = getCardVariants(card);
      if (cardVariants.length === 0) {
        return false;
      }

      const hasMatchingVariant = checkedVariants.some((variant) =>
        cardVariants.includes(variant)
      );

      if (!hasMatchingVariant) {
        return false;
      }
    }

    // Get prices based on selected variants and conditions
    const relevantPrices: number[] = [];

    conditionsToCheck.forEach(condition => {
      const price = card.prices?.[condition];
      if (price !== null && price !== undefined) {
        relevantPrices.push(price);
      }
    });

    // If no relevant prices found, exclude card when price filter is active
    if (relevantPrices.length === 0) {
      return false;
    }

    // Get min and max price for this card from relevant prices only
    const cardMinPrice = Math.min(...relevantPrices);
    const cardMaxPrice = Math.max(...relevantPrices);

    // Check if card's price range overlaps with filter range
    if (minPrice !== null && cardMaxPrice < minPrice) {
      return false;
    }

    if (maxPrice !== null && cardMinPrice > maxPrice) {
      return false;
    }

    return true;
  });
  
  return filtered;
};

export const filterPokedexCards = (cards: Card[]) => {
  return cards
    .filter((card) => {
      const r = card.rarities || [card.rarity];
      return card.cardType === 'Pokemon' && r.some((rv) => NON_HIT_RARITIES.includes(rv));
    })
    .sort((a, b) => a.nationalPokedexNumbers[0] - b.nationalPokedexNumbers[0]);
};

export const filterHitsCards = (cards: Card[]) => {
  return cards.filter((card) => {
    const r = card.rarities || [card.rarity];
    return !r.some((rv) => NON_HIT_RARITIES.includes(rv));
  });
};

export const filterNonHoloCards = (cards: Card[]) => {
  return cards.filter((card) => {
    const r = card.rarities || [card.rarity];
    return r.some((rv) => NON_HOLO_RARITIES.includes(rv));
  });
};

export const filterBulkCards = (cards: Card[]) => {
  return cards.filter((card) => {
    const r = card.rarities || [card.rarity];
    return r.some((rv) => BULK_RARITIES.includes(rv));
  });
};

export const filterSemiSetsCards = (cards: Card[]) => {
  return cards.filter((card) => {
    const r = card.rarities || [card.rarity];
    return r.some((rv) => NON_HIT_RARITIES.includes(rv));
  });
};

export const filterRareCards = (cards: Card[]) => {
  return cards.filter((card) => {
    const r = card.rarities || [card.rarity];
    return r.some((rv) => RARE_RARITIES.includes(rv));
  });
};

export const filterHoloCards = (cards: Card[]) => {
  return cards.filter((card) => {
    const r = card.rarities || [card.rarity];
    return r.some((rv) => HOLO_RARITIES.includes(rv));
  });
};

export const isCardInCollection = (card: Card, collections: string[]) => {
  return collections.some((collection) =>
    card.collections?.map((c) => c.name).includes(collection)
  );
};

// Determina si una carta es poseída según la suma y el límite
const isOwnedByCollections = (
  card: Card,
  collectionsToFilter: string[],
  limit: number,
  conditionsToFilter: string[] = ["All"]
) => {
  const collections = card.collections || [];
  const ownedQuantity = collections
    .filter((c) => collectionsToFilter.includes(c.name))
    .reduce((sum, c) => sum + sumConditionQuantity(c.quantity, conditionsToFilter), 0);
  return ownedQuantity >= limit;
};

export const filterCollectionViewCards = (
  cards: Card[],
  option: string,
  collectionsToFilter: string[],
  limit: number = 1,
  conditionsToFilter: string[] = ["All"]
) => {
  if (option !== "none") {
    if (option === "hideNotOwned") {
      // Mostrar solo las poseídas (suma >= límite)
      return cards.filter((card) =>
        isOwnedByCollections(card, collectionsToFilter, limit, conditionsToFilter)
      );
    }
    if (option === "hideOwned") {
      // Ocultar las poseídas (suma >= límite)
      return cards.filter(
        (card) => !isOwnedByCollections(card, collectionsToFilter, limit, conditionsToFilter)
      );
    }
    if (option === "shadowOwned") {
      // Sombrear las poseídas por suma
      return cards.map((card) => {
        if (isOwnedByCollections(card, collectionsToFilter, limit, conditionsToFilter)) {
          return { ...card, shadow: true };
        }
        return card;
      });
    }
    if (option === "shadowNotOwned") {
      // Sombrear las no poseídas por suma
      return cards.map((card) => {
        if (!isOwnedByCollections(card, collectionsToFilter, limit, conditionsToFilter)) {
          return { ...card, shadow: true };
        }
        return card;
      });
    }
  }
  return cards;
};

export const groupCardsByPokedex = (
  cards: (Card | PokemonWithoutCard)[],
  arrayPokedexNumbers: number[],
  selectedCollections?: string[],
  filterByCollection?: 'all' | 'owned' | 'notOwned' | 'ownedNone'
) => {
  return arrayPokedexNumbers.reduce(
    (acc: Record<number, (Card | PokemonWithoutCard)[]>, pokedexNumber) => {
      const cardsForPokedexNumber = cards.filter((card) => {
        if ('isPlaceholder' in card) {
          return card.pokedexNumber === pokedexNumber;
        }
        return card.nationalPokedexNumbers?.includes(pokedexNumber) || false;
      });
      
      // Only include groups that have at least one card (real or placeholder)
      if (cardsForPokedexNumber.length > 0) {
        // Check if user owns any card in this group (for ownedNone filter)
        let hasOwnedCards = false;
        let hasRealCards = false;
        
        if (selectedCollections && selectedCollections.length > 0) {
          hasRealCards = cardsForPokedexNumber.some(card => !('isPlaceholder' in card));
          hasOwnedCards = cardsForPokedexNumber.some(card => {
            if ('isPlaceholder' in card) return false;
            return (card.collections || [])
              .filter(c => selectedCollections.includes(c.name))
              .reduce((sum, c) => sum + sumConditionQuantity(c.quantity), 0) > 0;
          });
        }
        
        // Apply ownedNone filter: only show groups with real cards but no owned cards
        if (filterByCollection === 'ownedNone') {
          if (hasRealCards && !hasOwnedCards) {
            acc[pokedexNumber] = cardsForPokedexNumber;
          }
          return acc;
        }
        
        // If collections are selected, sort cards within group: owned first, then not owned
        if (selectedCollections && selectedCollections.length > 0) {
          const owned: (Card | PokemonWithoutCard)[] = [];
          const notOwned: (Card | PokemonWithoutCard)[] = [];
          
          cardsForPokedexNumber.forEach(card => {
            if ('isPlaceholder' in card) {
              notOwned.push(card);
            } else {
              const hasCards = (card.collections || [])
                .filter(c => selectedCollections.includes(c.name))
                .reduce((sum, c) => sum + sumConditionQuantity(c.quantity), 0) > 0;
              
              if (hasCards) {
                owned.push(card);
              } else {
                notOwned.push(card);
              }
            }
          });
          
          acc[pokedexNumber] = [...owned, ...notOwned];
        } else {
          acc[pokedexNumber] = cardsForPokedexNumber;
        }
      }
      return acc;
    },
    {}
  );
};

export const sliceGroups = (
  groupedCardsByPokedex: Record<number, (Card | PokemonWithoutCard)[]>,
  limit: number,
  hideNotOwnPokedex: boolean = false
) => {
  const keys = Object.keys(groupedCardsByPokedex)
    .map(Number)
    // Only filter empty groups if hideNotOwnPokedex is true
    .filter(key => {
      if (!hideNotOwnPokedex) return true;
      const group = groupedCardsByPokedex[key];
      // Keep group if it has at least one non-placeholder card
      return group.some(card => !('isPlaceholder' in card));
    });
  
  // Accumulate groups until we have approximately 'limit' cards
  const result: Record<number, (Card | PokemonWithoutCard)[]> = {};
  let cardCount = 0;
  
  for (const key of keys) {
    const groupCards = groupedCardsByPokedex[key];
    result[key] = groupCards;
    
    // Count only non-placeholder cards for the limit calculation
    const nonPlaceholderCount = groupCards.filter(card => !('isPlaceholder' in card)).length;
    if (nonPlaceholderCount > 0) {
      cardCount += nonPlaceholderCount;
    }
    
    // Continue until we pass the limit (to show at least one group beyond limit)
    if (cardCount >= limit) {
      break;
    }
  }
  
  return result;
};

// ========== NEW HIERARCHICAL FILTER FUNCTIONS ==========

/**
 * Apply basic filters to cards (Set, Rarity, Type, Energy, Variants, Conditions)
 * This is the first level of filtering after allCards
 */
export const applyBasicFilters = (
  cards: Card[],
  filters: {
    sets?: string[];
    rarities?: string[];
    types?: string[];
    energies?: string[];
    variants?: string[];
    conditions?: string[];
  }
): Card[] => {
  let result = [...cards];

  // Apply each filter if provided
  if (filters.sets && filters.sets.length > 0 && !filters.sets.includes('All')) {
    const checkedSets = new Set(filters.sets.map((set) => String(set)));
    result = result.filter((card) => {
      if (checkedSets.has(card.setId)) return true;
      const setNames = card.setNames && card.setNames.length > 0 ? card.setNames : [card.setName];
      return setNames.some((setName) => checkedSets.has(setName));
    });
  }
  if (filters.rarities && filters.rarities.length > 0 && !filters.rarities.includes('All')) {
    result = filterCardsByProperty(result, 'rarities', filters.rarities);
  }
  if (filters.types && filters.types.length > 0 && !filters.types.includes('All')) {
    result = filterCardsByProperty(result, 'types', filters.types);
  }
  if (filters.energies && filters.energies.length > 0 && !filters.energies.includes('All')) {
    result = filterCardsByProperty(result, 'types', filters.energies);
  }
  if (filters.variants && filters.variants.length > 0 && !filters.variants.includes('All')) {
    result = filterCardsByProperty(result, 'variants', filters.variants);
  }
  if (filters.conditions && filters.conditions.length > 0 && !filters.conditions.includes('All')) {
    result = filterCardsByProperty(result, 'conditions', filters.conditions);
  }

  return result;
};

/**
 * Apply price range filter to cards
 * This is the second level of filtering
 */
export const applyPriceFilter = (
  cards: Card[],
  minPrice: number | null,
  maxPrice: number | null,
  variantsFilter: string[] = ['All'],
  conditionsFilter: string[] = ['All']
): Card[] => {
  return filterCardsByPriceRange(cards, minPrice, maxPrice, variantsFilter, conditionsFilter);
};

/**
 * Apply sorting to cards
 * This is the third level (after price filter)
 */
import {
  orderByEnergy,
  orderByEnergyAndName,
  orderByEnergyAndPokedex,
  orderByNumber,
  orderByPokedex,
  orderByRariTies,
  orderByPriceAsc,
  orderByPriceDesc,
  orderBySetAndNumber,
} from './orders';

export const applySorting = (
  cards: Card[],
  sortField: 'number' | 'pokedex' | 'energy' | 'rarity' | 'energyAndName' | 'energyAndPokedex' | 'price' | 'name' | 'setAndNumber',
  sortDirection: 'asc' | 'desc',
  variantsFilter: string[] = ['All']
): Card[] => {
  // No need to spread - order functions already create new arrays
  switch (sortField) {
    case 'number':
      return orderByNumber(cards);
    case 'setAndNumber':
      return orderBySetAndNumber(cards);
    case 'pokedex':
      return orderByPokedex(cards);
    case 'energy':
      return orderByEnergy(cards);
    case 'rarity':
      return orderByRariTies(cards);
    case 'energyAndName':
      return orderByEnergyAndName(cards);
    case 'energyAndPokedex':
      return orderByEnergyAndPokedex(cards);
    case 'price':
      return sortDirection === 'asc' 
        ? orderByPriceAsc(cards, variantsFilter)
        : orderByPriceDesc(cards, variantsFilter);
    default:
      return cards;
  }
};

/**
 * Apply collection filter to cards (hide/shadow owned/not-owned)
 * This is the fourth level of filtering
 */
export const applyCollectionFilter = (
  cards: Card[],
  mode: 'none' | 'hideOwned' | 'hideNotOwned' | 'shadowOwned' | 'shadowNotOwned',
  selectedCollections: string[],
  limit: number = 1,
  conditionsToFilter: string[] = ["All"]
): Card[] => {
  if (mode === 'none' || selectedCollections.length === 0) {
    // Only reset shadow if any card has it set
    const hasShadow = cards.some(card => card.shadow);
    if (!hasShadow) return cards;
    return cards.map(card => ({ ...card, shadow: false }));
  }
  
  return filterCollectionViewCards(cards, mode, selectedCollections, limit, conditionsToFilter);
};

/**
 * Apply Pokédex filter (includes Pokémon without cards if enabled)
 * This is the fifth level of filtering
 */
import { POKEDEX_REGIONS, getRegionForPokedexNumber } from '../constants/constants';

export const applyPokedexFilter = (
  cards: Card[],
  options: {
    includeWithoutCards: boolean;
    filterByCollection: 'all' | 'owned' | 'notOwned' | 'ownedNone';
    regionsFilter: string[];
    groupingRegions: string[];
    selectedCollections: string[];
    collectionMode: 'none' | 'hideOwned' | 'hideNotOwned' | 'shadowOwned' | 'shadowNotOwned';
  }
): (Card | PokemonWithoutCard)[] => {
  // Start fresh: remove any existing placeholders from previous executions
  let result: (Card | PokemonWithoutCard)[] = cards.filter(card => !('isPlaceholder' in card));
  
  // Filter by Pokédex regions first (uses regionsFilter from external filter)
  if (options.regionsFilter.length > 0 && !options.regionsFilter.includes('All')) {
    result = result.filter(card => {
      return card.pokedexRegion && options.regionsFilter.includes(card.pokedexRegion);
    });
  }
  
  // Include Pokémon without cards if enabled
  if (options.includeWithoutCards) {
    // Determine which Pokédex numbers to include based on grouping regions
    const regionsToInclude = options.groupingRegions.length > 0 && !options.groupingRegions.includes('All')
      ? POKEDEX_REGIONS.filter(r => options.groupingRegions.includes(r.name))
      : POKEDEX_REGIONS;
    
    // Get all Pokédex numbers from the filtered regions
    const allPokedexNumbers: number[] = [];
    regionsToInclude.forEach(region => {
      for (let i = region.start; i <= region.end; i++) {
        allPokedexNumbers.push(i);
      }
    });
    
    // Get existing Pokédex numbers from cards in the current filtered set
    // Logic depends on collection mode:
    // - Shadow modes: All cards count (shadowed or not) - shadow is just visualization
    // - Hide modes: Only non-shadowed cards count - hidden cards were actually filtered out
    const isShadowMode = options.collectionMode === 'shadowOwned' || options.collectionMode === 'shadowNotOwned';
    const pokedexNumbersWithCards = new Set<number>();
    result.forEach(card => {
      if (!('isPlaceholder' in card) && card.nationalPokedexNumbers) {
        // In shadow mode, all cards count (shadow is just visual)
        // In hide mode, only count non-shadowed cards (shadowed means filtered)
        if (isShadowMode || !card.shadow) {
          card.nationalPokedexNumbers.forEach(num => pokedexNumbersWithCards.add(num));
        }
      }
    });
    
    // Create placeholders for missing Pokémon
    const missingPokedexNumbers = allPokedexNumbers.filter(num => !pokedexNumbersWithCards.has(num));
    const placeholders: PokemonWithoutCard[] = missingPokedexNumbers.map(num => ({
      id: `placeholder-${num}`,
      isPlaceholder: true,
      pokedexNumber: num,
      pokedexRegion: getRegionForPokedexNumber(num) || 'Unknown',
      name: `#${num}`,
      ownedInCollection: false
    }));
    
    // Apply filterByCollection before adding placeholders
    if (options.filterByCollection === 'owned') {
      // Keep only cards from Pokémon that have at least one card
      // Don't add placeholders at all
      result = result.filter(item => {
        if ('isPlaceholder' in item) {
          return false;
        }
        const pokedexNums = item.nationalPokedexNumbers || [];
        return pokedexNums.some(num => pokedexNumbersWithCards.has(num));
      });
      // Don't add placeholders when showing only owned
    } else if (options.filterByCollection === 'notOwned') {
      // Remove all actual cards, add only placeholders for Pokémon without cards
      result = placeholders;
    } else {
      // filterByCollection === 'all': Add all placeholders
      result = [...result, ...placeholders];
    }
  }
  
  return result;
};

/**
 * Apply search filter to cards
 * This is the final level of filtering
 */
export const applySearchFilter = (
  cards: (Card | import('../types/dashboard').PokemonWithoutCard)[],
  searchTerm: string
): (Card | import('../types/dashboard').PokemonWithoutCard)[] => {
  if (!searchTerm || searchTerm.trim() === '') {
    return cards;
  }
  
  const term = searchTerm.toLowerCase().trim();
  
  return cards.filter(card => {
    if ('isPlaceholder' in card) {
      // Filter placeholder Pokémon
      return card.name.toLowerCase().includes(term) ||
             card.pokedexNumber.toString().includes(term);
    }
    
    // Filter regular cards
    return card.name?.toLowerCase().includes(term) ||
           card.id?.toLowerCase().includes(term) ||
           card.setName?.toLowerCase().includes(term) ||
           (card.setNames ?? []).some((setName) => setName.toLowerCase().includes(term)) ||
           card.artist?.toLowerCase().includes(term) ||
           card.number?.toLowerCase().includes(term);
  });
};

// ========== POKEMON FORMS FILTER FUNCTIONS ==========

/**
 * Rule order:
 * 1) If no allow/hide variants selected: only show default forms (isDefault === true)
 * 2) allow: add all forms matching at least one allow variant
 * 3) hide: remove any included form matching at least one hide variant
 * Flow: defaults → add allowed → remove hidden
 */
export const shouldIncludePokemonForm = (
  form: PokemonFormData,
  allowVariants: string[] = [],
  hideVariants: string[] = []
): boolean => {
  const formVariantNames = form.variants.map(v => v.pokemonVariant.name);

  // 'Default' is a virtual variant that maps to isDefault
  const allowDefault = allowVariants.includes('Default');
  const hideDefault = hideVariants.includes('Default');
  const realAllowVariants = allowVariants.filter(v => v !== 'Default');
  const realHideVariants = hideVariants.filter(v => v !== 'Default');

  // Step 1: determine inclusion
  let included = false;

  // Include default forms if 'Default' is in allow list
  if (allowDefault && form.isDefault) {
    included = true;
  }

  // Include forms matching any real allow variant
  if (realAllowVariants.length > 0 &&
    formVariantNames.length > 0 &&
    formVariantNames.some(variant => realAllowVariants.includes(variant))) {
    included = true;
  }

  if (!included) return false;

  // Step 2: apply hide rules
  // Hide default forms if 'Default' is in hide list
  if (hideDefault && form.isDefault) {
    return false;
  }

  // Exception: if form is default and was included via allowDefault, skip real hide variant rules
  if (allowDefault && form.isDefault) {
    return true;
  }

  // Hide forms matching any real hide variant
  if (realHideVariants.length > 0 &&
    formVariantNames.some(variant => realHideVariants.includes(variant))) {
    return false;
  }

  return true;
};

/**
 * Apply Pokemon Forms filter (group cards by pokemon form name)
 * Similar to applyPokedexFilter but uses pokemonForms field and Pokemon Forms API data
 */
export const applyFormsFilter = (
  cards: Card[],
  pokemonFormsData: PokemonFormData[],
  options: {
    filterByCollection: 'all' | 'owned' | 'notOwned' | 'ownedNone';
    groupingRegions: string[];
    allowVariants: string[];
    hideVariants: string[];
    selectedCollections: string[];
    collectionMode: 'none' | 'hideOwned' | 'hideNotOwned' | 'shadowOwned' | 'shadowNotOwned';
    fallbackToDefault: boolean;
  }
): (Card | PokemonFormWithoutCard)[] => {
  let result: (Card | PokemonFormWithoutCard)[] = cards.filter(card => !('isPlaceholder' in card));

  // Filter forms data by selected regions
  let filteredForms = pokemonFormsData;
  if (options.groupingRegions.length > 0 && !options.groupingRegions.includes('All')) {
    filteredForms = pokemonFormsData.filter(form =>
      form.regions.some(r => options.groupingRegions.includes(r.region.name))
    );
  }

  // Variant rule: allow first, hide second
  const formsToShow = filteredForms.filter(form =>
    shouldIncludePokemonForm(form, options.allowVariants, options.hideVariants)
  );

  // Get form names that should be included
  const formNamesToInclude = new Set(formsToShow.map(f => f.name));

  // Fallback to default: remap cards whose forms are all unrecognized to the default form
  if (options.fallbackToDefault) {
    // Build lookup: pokemonId -> default form name (only from formsToShow)
    const pokemonIdToDefaultForm = new Map<number, string>();
    formsToShow.forEach(form => {
      if (form.isDefault) {
        pokemonIdToDefaultForm.set(form.pokemonId, form.name);
      }
    });

    // Build lookup: unincluded form name -> pokemonId
    const unincludedFormToPokemonId = new Map<string, number>();
    pokemonFormsData.forEach(form => {
      if (!formNamesToInclude.has(form.name)) {
        unincludedFormToPokemonId.set(form.name, form.pokemonId);
      }
    });

    result = result.map(item => {
      if ('isPlaceholder' in item) return item;
      const card = item as Card;
      const cardForms = card.pokemonForms || [];
      if (cardForms.length === 0) return card;

      // If the card already has a recognized form, keep it as-is
      if (cardForms.some(f => formNamesToInclude.has(f))) {
        return card;
      }

      // Try to map unrecognized forms to their default form
      const defaultForms = new Set<string>();
      cardForms.forEach(formName => {
        const pokemonId = unincludedFormToPokemonId.get(formName);
        if (pokemonId !== undefined) {
          const defaultFormName = pokemonIdToDefaultForm.get(pokemonId);
          if (defaultFormName) {
            defaultForms.add(defaultFormName);
          }
        }
      });

      if (defaultForms.size > 0) {
        return { ...card, pokemonForms: [...defaultForms] };
      }
      return card;
    }) as (Card | PokemonFormWithoutCard)[];
  }

  // Filter cards by region: only include cards whose pokemonForms intersect with formNamesToInclude
  if (options.groupingRegions.length > 0 && !options.groupingRegions.includes('All')) {
    result = result.filter(card => {
      if (!('pokemonForms' in card)) return false;
      const cardForms = (card as Card).pokemonForms || [];
      return cardForms.some(formName => formNamesToInclude.has(formName));
    }) as Card[];
  }

  // Determine which forms have cards
  const isShadowMode = options.collectionMode === 'shadowOwned' || options.collectionMode === 'shadowNotOwned';
  const formNamesWithCards = new Set<string>();
  result.forEach(item => {
    if (!('isPlaceholder' in item)) {
      const card = item as Card;
      if (card.pokemonForms) {
        if (isShadowMode || !card.shadow) {
          card.pokemonForms.forEach(name => formNamesWithCards.add(name));
        }
      }
    }
  });

  // Create placeholders for forms without cards
  const missingForms = formsToShow.filter(form => !formNamesWithCards.has(form.name));
  const placeholders: PokemonFormWithoutCard[] = missingForms.map(form => ({
    id: `form-placeholder-${form.id}`,
    isPlaceholder: true,
    name: form.pokemon.name,
    formName: form.name,
    image: form.image,
    pokemonNumber: form.number,
    regionName: form.regions[0]?.region.name || 'Unknown',
    isDefault: form.isDefault,
    variantNames: form.variants.map(v => v.pokemonVariant.name),
    ownedInCollection: false
  }));

  // Apply filterByCollection
  if (options.filterByCollection === 'owned') {
    result = result.filter(item => {
      if ('isPlaceholder' in item) return false;
      const card = item as Card;
      return card.pokemonForms?.some(name => formNamesWithCards.has(name)) || false;
    });
  } else if (options.filterByCollection === 'notOwned') {
    result = placeholders;
  } else {
    result = [...result, ...placeholders];
  }

  return result;
};

/**
 * Group cards by Pokemon form name
 */
export const groupCardsByForm = (
  cards: (Card | PokemonFormWithoutCard)[],
  formsToShow: PokemonFormData[],
  selectedCollections?: string[],
  filterByCollection?: 'all' | 'owned' | 'notOwned' | 'ownedNone'
) => {
  return formsToShow.reduce(
    (acc: Record<string, { form: PokemonFormData; cards: (Card | PokemonFormWithoutCard)[] }>, form) => {
      const formName = form.name;
      const cardsForForm = cards.filter(card => {
        if ('isPlaceholder' in card) {
          return (card as PokemonFormWithoutCard).formName === formName;
        }
        return (card as Card).pokemonForms?.includes(formName) || false;
      });

      let hasOwnedCards = false;
      let hasRealCards = false;

      if (selectedCollections && selectedCollections.length > 0) {
        hasRealCards = cardsForForm.some(card => !('isPlaceholder' in card));
        hasOwnedCards = cardsForForm.some(card => {
          if ('isPlaceholder' in card) return false;
          return ((card as Card).collections || [])
            .filter(c => selectedCollections.includes(c.name))
            .reduce((sum, c) => {
              const qty = c.quantity || {};
              return sum + Object.values(qty).reduce((s, v) => s + (v || 0), 0);
            }, 0) > 0;
        });
      }

      // Apply ownedNone filter
      if (filterByCollection === 'ownedNone') {
        if (hasRealCards && !hasOwnedCards) {
          acc[formName] = { form, cards: cardsForForm };
        }
        return acc;
      }

      if (cardsForForm.length > 0) {
        acc[formName] = { form, cards: cardsForForm };
      }
      return acc;
    },
    {}
  );
};

/**
 * Slice form groups for pagination
 */
export const sliceFormGroups = (
  groupedCards: Record<string, { form: PokemonFormData; cards: (Card | PokemonFormWithoutCard)[] }>,
  limit: number
) => {
  const keys = Object.keys(groupedCards);
  const result: Record<string, { form: PokemonFormData; cards: (Card | PokemonFormWithoutCard)[] }> = {};
  let cardCount = 0;

  for (const key of keys) {
    const group = groupedCards[key];
    result[key] = group;

    const nonPlaceholderCount = group.cards.filter(card => !('isPlaceholder' in card)).length;
    if (nonPlaceholderCount > 0) {
      cardCount += nonPlaceholderCount;
    }

    if (cardCount >= limit) break;
  }

  return result;
};
