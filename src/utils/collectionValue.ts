import type { Card, ConditionKey, QuantityKey } from "../types/dashboard";

const PRICE_CONDITIONS: ConditionKey[] = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Damaged",
  "Heavily Played",
];

const getBestAvailablePrice = (card: Card): number | null => {
  for (const condition of PRICE_CONDITIONS) {
    const price = card.prices?.[condition];
    if (price !== null && price !== undefined) return price;
  }
  return null;
};

const OWNED_CONDITION_ORDER: QuantityKey[] = [...PRICE_CONDITIONS.filter((condition) => condition !== "Damaged"), "Damaged", "Unknown"];

export const CONDITION_ABBREVIATIONS: Record<QuantityKey, string> = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  "Damaged": "DMG",
  "Unknown": "",
};

export type OwnedConditionPrice = { condition: QuantityKey; copies: number; price: number | null };

/**
 * The conditions of the copies held in these collections, each with the price a copy in
 * that condition is valued at - the same price `getCollectionPriceTotal` adds up. A copy
 * with no recorded condition is valued at the best price available.
 */
export const ownedConditionPrices = (
  card: Card,
  collectionsToFilter: string[],
  conditionsFilter: string[] = ["All"]
): OwnedConditionPrice[] => {
  const includeAllConditions = conditionsFilter.includes("All");
  const copies = new Map<QuantityKey, number>();
  for (const collection of card.collections || []) {
    if (!collectionsToFilter.includes(collection.name)) continue;
    for (const [condition, rawQuantity] of Object.entries(collection.quantity || {})) {
      if (!includeAllConditions && !conditionsFilter.includes(condition)) continue;
      copies.set(condition as QuantityKey, (copies.get(condition as QuantityKey) ?? 0) + (rawQuantity || 0));
    }
  }
  const fallbackPrice = getBestAvailablePrice(card);
  return OWNED_CONDITION_ORDER
    .filter((condition) => (copies.get(condition) ?? 0) > 0)
    .map((condition) => ({
      condition,
      copies: copies.get(condition) ?? 0,
      price: condition === "Unknown" ? fallbackPrice : card.prices?.[condition] ?? fallbackPrice,
    }));
};

/** Count the physical copies held in the selected collections. */
export const getCollectionCopyCount = (
  card: Card,
  collectionsToFilter: string[],
  conditionsFilter: string[] = ["All"]
): number => {
  const includeAllConditions = conditionsFilter.includes("All");
  return (card.collections || [])
    .filter((collection) => collectionsToFilter.includes(collection.name))
    .reduce((collectionTotal, collection) => {
      return collectionTotal + Object.entries(collection.quantity || {}).reduce((total, [condition, rawQuantity]) => {
        if (!includeAllConditions && !conditionsFilter.includes(condition)) return total;
        return total + (rawQuantity || 0);
      }, 0);
    }, 0);
};

/** Value the physical copies held in the selected collections, by their condition. */
export const getCollectionPriceTotal = (
  card: Card,
  collectionsToFilter: string[],
  conditionsFilter: string[] = ["All"]
): number => {
  const fallbackPrice = getBestAvailablePrice(card);
  if (fallbackPrice === null) return 0;

  const includeAllConditions = conditionsFilter.includes("All");
  return (card.collections || [])
    .filter((collection) => collectionsToFilter.includes(collection.name))
    .reduce((collectionTotal, collection) => {
      const quantity = collection.quantity || {};
      return collectionTotal + Object.entries(quantity).reduce((total, [condition, rawQuantity]) => {
        const copies = rawQuantity || 0;
        if (copies <= 0) return total;
        if (!includeAllConditions && !conditionsFilter.includes(condition)) {
          return total;
        }

        const conditionPrice = condition === "Unknown"
          ? fallbackPrice
          : card.prices?.[condition as ConditionKey] ?? fallbackPrice;
        return conditionPrice === null ? total : total + conditionPrice * copies;
      }, 0);
    }, 0);
};
