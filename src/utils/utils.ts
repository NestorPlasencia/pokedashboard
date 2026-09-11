import { Card, Collection } from "../types/dashboard";
import { POKEDEX_REGIONS, getRegionForPokedexNumber } from "../constants/constants";
import { getCollectionCopyCount, getCollectionPriceTotal } from "./collectionValue";

export const removeAllOccurrences = <T>(arr: T[], value: T): T[] => {
  let i = 0;
  while (i < arr.length) {
    if (arr[i] === value) {
      arr.splice(i, 1);
    } else {
      ++i;
    }
  }
  return arr;
};

export const loadJSONFile = async <T>(path: string): Promise<T> => {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error("Network response was not ok!");
    }
    const data: T = await response.json();
    return data;
  } catch (error) {
    console.error("Error loading JSON file:", error);
    throw error;
  }
};

export const mergeArraysById = <
  T extends { id: string },
  U extends Partial<T> & { id: string }
>(
  arr1: T[],
  arr2: U[]
): U[] => {
  const merged: U[] = [];

  arr1.forEach((obj1) => {
    const obj2 = arr2.find((el) => el.id === obj1.id);

    if (obj2) {
      const mergedObj = { ...obj1, ...obj2 };
      merged.push(mergedObj as unknown as U);
    } else {
      merged.push(obj1 as unknown as U);
    }
  });

  return merged;
};

export const getUniqueValuesFromProperty = <T, K extends keyof T>(
  arrayObjects: T[],
  property: K
): string[] => {
  const uniqueValues = new Set<string>();

  // Manejo especial para variant
  if (property === 'variant') {
    arrayObjects.forEach((object) => {
      const card = object as unknown as Card;
      if (card.variant) {
        uniqueValues.add(card.variant);
      }
    });
    return Array.from(uniqueValues);
  }

  // Manejo especial para conditions: derivar de keys de prices
  if ((property as string) === 'conditions') {
    arrayObjects.forEach((object) => {
      const card = object as unknown as Card;
      Object.keys(card.prices || {}).forEach((cond) => {
        uniqueValues.add(cond);
      });
    });
    return Array.from(uniqueValues);
  }

  // Manejo especial para pokedexRegion - siempre incluir todas las regiones
  if (property === 'pokedexRegion') {
    arrayObjects.forEach((object) => {
      const card = object as unknown as Card;
      const fallbackRegion = card.nationalPokedexNumbers?.length
        ? getRegionForPokedexNumber(card.nationalPokedexNumbers[0])
        : null;
      const resolvedRegion = card.pokedexRegion || fallbackRegion;
      if (resolvedRegion) {
        uniqueValues.add(resolvedRegion);
      }
    });
    // Siempre incluir todas las regiones disponibles
    POKEDEX_REGIONS.forEach((region) => {
      uniqueValues.add(region.name);
    });
    return Array.from(uniqueValues);
  }

  // Manejo especial para setSeries: incluir series secundarias de cartas multi-set
  if (property === 'setSeries') {
    arrayObjects.forEach((object) => {
      const card = object as unknown as Card;
      const seriesNames =
        card.setSeriesNames && card.setSeriesNames.length > 0
          ? card.setSeriesNames
          : [card.setSeries];
      seriesNames.forEach((series) => {
        if (series) uniqueValues.add(series);
      });
    });
    return Array.from(uniqueValues);
  }

  arrayObjects.forEach((object) => {
    const propValue = object[property] as unknown;

    if (propValue !== undefined && propValue !== null) {
      if (Array.isArray(propValue)) {
        (propValue as unknown[]).forEach((item) => {
          if (typeof item === "string") {
            uniqueValues.add(item);
          } else if (typeof item === "number" || typeof item === "boolean") {
            uniqueValues.add(String(item));
          }
        });
      } else if (typeof propValue === "string") {
        uniqueValues.add(propValue as string);
      } else if (typeof propValue === "number" || typeof propValue === "boolean") {
        uniqueValues.add(String(propValue));
      }
    }
  });

  return Array.from(uniqueValues);
};

export const countValuesFromProperty = <T>(
  arrayObjects: T[],
  property: keyof T,
  values: Array<T[keyof T]>
): Record<string, number> => {
  const count: Record<string, number> = {};
  values.forEach((valor) => {
    count[String(valor)] = 0;
  });
  arrayObjects.forEach((obj) => {
    const propValue = obj[property];
    if (propValue !== undefined && propValue !== null) {
      count[String(propValue)] = (count[String(propValue)] || 0) + 1;
    }
  });
  return count;
};

export const countSingleValueFromProperty = <T>(
  arrayObjects: T[],
  property: keyof T,
  value: T[keyof T]
): number => {
  let count = 0;
  const valueStr = String(value);

  // Manejo especial para variant
  if (property === 'variant') {
    arrayObjects.forEach((obj) => {
      const card = obj as unknown as Card;
      if (card.variant && card.variant === valueStr) {
        count += 1;
      }
    });
    return count;
  }

  // Manejo especial para pokedexRegion: usar valor directo o derivado
  if (property === 'pokedexRegion') {
    arrayObjects.forEach((obj) => {
      const card = obj as unknown as Card;
      const fallbackRegion = card.nationalPokedexNumbers?.length
        ? getRegionForPokedexNumber(card.nationalPokedexNumbers[0])
        : null;
      const resolvedRegion = card.pokedexRegion || fallbackRegion;
      if (resolvedRegion === valueStr) {
        count += 1;
      }
    });
    return count;
  }

  // Manejo especial para setSeries: contar series secundarias de cartas multi-set
  if (property === 'setSeries') {
    arrayObjects.forEach((obj) => {
      const card = obj as unknown as Card;
      const seriesNames =
        card.setSeriesNames && card.setSeriesNames.length > 0
          ? card.setSeriesNames
          : [card.setSeries];
      if (seriesNames.includes(valueStr)) {
        count += 1;
      }
    });
    return count;
  }

  arrayObjects.forEach((obj) => {
    const propValue = obj[property];
    if (propValue !== undefined && propValue !== null) {
      if (Array.isArray(propValue)) {
        const itemsAsStrings = (propValue as unknown[]).map((it) => String(it));
        if (itemsAsStrings.includes(valueStr)) {
          count += 1;
        }
      } else if (String(propValue) === valueStr) {
        count += 1;
      }
    }
  });

  return count;
};

/**
 * Count all values for a property in a single pass through the array.
 * This is O(n) instead of O(n*m) when calling countSingleValueFromProperty for each value.
 */
export const countAllValuesFromProperty = <T>(
  arrayObjects: T[],
  property: keyof T
): Record<string, number> => {
  const counts: Record<string, number> = {};

  if (property === 'variant') {
    arrayObjects.forEach((obj) => {
      const card = obj as unknown as Card;
      if (card.variant) {
        counts[card.variant] = (counts[card.variant] || 0) + 1;
      }
    });
    return counts;
  }

  if (property === 'pokedexRegion') {
    arrayObjects.forEach((obj) => {
      const card = obj as unknown as Card;
      const fallbackRegion = card.nationalPokedexNumbers?.length
        ? getRegionForPokedexNumber(card.nationalPokedexNumbers[0])
        : null;
      const resolvedRegion = card.pokedexRegion || fallbackRegion;
      if (resolvedRegion) {
        counts[resolvedRegion] = (counts[resolvedRegion] || 0) + 1;
      }
    });
    return counts;
  }

  if (property === 'setSeries') {
    arrayObjects.forEach((obj) => {
      const card = obj as unknown as Card;
      const seriesNames =
        card.setSeriesNames && card.setSeriesNames.length > 0
          ? card.setSeriesNames
          : [card.setSeries];
      seriesNames.forEach((name) => {
        if (name) {
          counts[name] = (counts[name] || 0) + 1;
        }
      });
    });
    return counts;
  }

  arrayObjects.forEach((obj) => {
    const propValue = obj[property];
    if (propValue !== undefined && propValue !== null) {
      if (Array.isArray(propValue)) {
        (propValue as unknown[]).forEach((item) => {
          const key = String(item);
          counts[key] = (counts[key] || 0) + 1;
        });
      } else {
        const key = String(propValue);
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  });

  return counts;
};

export const toKebabCase = (txt: string): string => {
  return txt
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+/g, "-");
};

export const arraysEqual = (arr1: string[], arr2: string[]) => {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((value, index) => value === arr2[index]);
};

/** Sum all condition quantities in a collection entry */
export const getCollectionTotalQuantity = (collection: Collection): number => {
  if (!collection.quantity) return 0;
  return Object.values(collection.quantity).reduce((sum, q) => sum + (q || 0), 0);
};

// Funciones para el manejo de colecciones
const getOwnedQuantitySum = (
  card: Card,
  collectionsToFilter: string[],
  conditionsFilter: string[] = ["All"]
) => {
  return getCollectionCopyCount(card, collectionsToFilter, conditionsFilter);
};

export const calculatePriceSummary = (
  cards: Card[], 
  _variantsFilterForPrices: string[] = ["All"],
  filterByCollections: boolean = false,
  collectionsChecked: string[] = [],
  limit: number = 1,
  variantsFilter: string[] = ["All"],
  conditionsFilter: string[] = ["All"]
) => {
  void _variantsFilterForPrices;
  let priceTotal = 0;
  let priceCount = 0;
  let withoutPriceCount = 0;
  
  // Card counts
  let totalCards = cards.length;
  let totalCopies = cards.length;
  
  // Collection data
  let ownedCards = 0;
  let ownedPrice = 0;
  let ownedToLimit = 0;
  let missingToLimit = 0;
  let totalToLimitPrice = 0;
  let ownedToLimitPrice = 0;
  
  // Detailed price breakdown
  let nearMintTotal = 0;
  let lightlyPlayedTotal = 0;
  let moderatelyPlayedTotal = 0;
  let damagedTotal = 0;
  let heavilyPlayedTotal = 0;
  
  let nearMintCount = 0;
  let lightlyPlayedCount = 0;
  let moderatelyPlayedCount = 0;
  let damagedCount = 0;
  let heavilyPlayedCount = 0;

  const isCollectionView = filterByCollections && collectionsChecked.length > 0;

  // Filter cards by variants if not "All" - using variant field
  let filteredCards = cards;
  if (!variantsFilter.includes("All")) {
    filteredCards = filteredCards.filter(card => {
      return card.variant && variantsFilter.includes(card.variant);
    });
  }

  // Filter cards by conditions if not "All"
  if (!conditionsFilter.includes("All")) {
    filteredCards = filteredCards.filter(card => {
      const cardConditions = Object.keys(card.prices || {});
      return conditionsFilter.some(condition => cardConditions.includes(condition));
    });
  }

  // Update totalCards count with filtered results
  totalCards = filteredCards.length;
  totalCopies = isCollectionView
    ? filteredCards.reduce(
        (sum, card) => sum + getCollectionCopyCount(card, collectionsChecked, conditionsFilter),
        0
      )
    : totalCards;

  filteredCards.forEach(card => {
    let hasAnyPrice = false;
    let selectedPrice: number | null = null;
    
    // Check if card is owned
    const ownedSum = isCollectionView
      ? getOwnedQuantitySum(card, collectionsChecked, conditionsFilter)
      : 0;
    const isOwned = isCollectionView ? ownedSum >= limit : false;

    if (isCollectionView) {
      ownedToLimit += Math.min(limit, ownedSum);
      missingToLimit += Math.max(0, limit - ownedSum);
    }
    
    if (isOwned) {
      ownedCards++;
    }

    // Get best available price from flat prices
    const prices = card.prices;
    if (prices) {
      if (prices["Near Mint"] !== null && prices["Near Mint"] !== undefined) {
        selectedPrice = prices["Near Mint"];
        nearMintTotal += prices["Near Mint"];
        nearMintCount++;
        hasAnyPrice = true;
      } else if (prices["Lightly Played"] !== null && prices["Lightly Played"] !== undefined) {
        selectedPrice = prices["Lightly Played"];
        lightlyPlayedTotal += prices["Lightly Played"];
        lightlyPlayedCount++;
        hasAnyPrice = true;
      } else if (prices["Moderately Played"] !== null && prices["Moderately Played"] !== undefined) {
        selectedPrice = prices["Moderately Played"];
        moderatelyPlayedTotal += prices["Moderately Played"];
        moderatelyPlayedCount++;
        hasAnyPrice = true;
      } else if (prices["Damaged"] !== null && prices["Damaged"] !== undefined) {
        selectedPrice = prices["Damaged"];
        damagedTotal += prices["Damaged"];
        damagedCount++;
        hasAnyPrice = true;
      } else if (prices["Heavily Played"] !== null && prices["Heavily Played"] !== undefined) {
        selectedPrice = prices["Heavily Played"];
        heavilyPlayedTotal += prices["Heavily Played"];
        heavilyPlayedCount++;
        hasAnyPrice = true;
      }
    }

    if (hasAnyPrice && selectedPrice !== null) {
      const cardValue = isCollectionView
        ? getCollectionPriceTotal(card, collectionsChecked, conditionsFilter)
        : selectedPrice;
      priceCount++;
      priceTotal += cardValue;
      if (isOwned) ownedPrice += cardValue;
      totalToLimitPrice += selectedPrice * limit;
      if (isCollectionView) {
        ownedToLimitPrice += selectedPrice * Math.min(limit, ownedSum);
      }
    }
    
    if (!hasAnyPrice) {
      withoutPriceCount++;
    }
  });

  return {
    // General totals
      total: priceTotal,
      count: priceCount,
      withoutPriceCount: withoutPriceCount,
      totalCards: totalCards,
      totalCopies,
    
    // Collection data
    isCollectionView,
    ownedCards,
    ownedPrice,
    totalCardsToLimit: totalCards * limit,
    ownedToLimit,
    ownedToLimitPriceTotal: ownedToLimitPrice,
    totalToLimitPrice,
    missingCards: totalCards - ownedCards,
    missingToLimit,
    missingToLimitPriceTotal: totalToLimitPrice - ownedToLimitPrice,
    missingPrice: priceTotal - ownedPrice,
    
    // Detailed breakdown
    breakdown: {
      "Near Mint": { total: nearMintTotal, count: nearMintCount },
      "Lightly Played": { total: lightlyPlayedTotal, count: lightlyPlayedCount },
      "Moderately Played": { total: moderatelyPlayedTotal, count: moderatelyPlayedCount },
      "Damaged": { total: damagedTotal, count: damagedCount },
      "Heavily Played": { total: heavilyPlayedTotal, count: heavilyPlayedCount }
    }
  };
};

export const getCardPriceBreakdown = (card: Card) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(price);
  };

  const breakdown: Array<{
    condition: string;
    price: string;
    rawPrice: number;
  }> = [];

  if (card.prices) {
    const prices = card.prices;
    Object.entries(prices).forEach(([condition, price]) => {
      if (price !== null && price !== undefined && typeof price === 'number') {
        breakdown.push({
          condition,
          price: formatPrice(price),
          rawPrice: price
        });
      }
    });
  }

  return breakdown;
};

export const filterCardsByPriceType = (cards: Card[], priceTypeFilter: string[]) => {
  if (priceTypeFilter.includes("All")) {
    return cards;
  }

  return cards.filter(card => {
    const hasPrice = card.prices && Object.values(card.prices).some(price => price !== null && price !== undefined);
    return hasPrice;
  });
};

// Convierte una lista de nombres de colecciones a objetos Collection
