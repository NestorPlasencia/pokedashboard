import type { Card, ConditionKey } from "../types/dashboard";

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
