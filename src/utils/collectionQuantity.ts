import type { Card, OptionsCollection } from "../types/dashboard";
import type { ViewMode } from "./viewMode";
import { collectionScopeNames } from "./collectionTree";
import { getCollectionTotalQuantity } from "./utils";
import { countCopies } from "./copyCount";

/**
 * A collection view is already scoped by the route, so its quantity must not depend on
 * the optional collection filter being enabled. In catalog/wishlist views the filter keeps
 * its existing meaning.
 */
export const quantityCollectionNames = (
  viewMode: ViewMode,
  collections: OptionsCollection[],
  selectedCollections: string[]
) => viewMode.kind === "collection"
  ? collectionScopeNames(collections, viewMode.name)
  : selectedCollections;

/** Selecting one or more collections is the ownership-filter trigger. */
export const activeFilterCollectionNames = (
  selectedCollections: string[]
) => selectedCollections;

export const quantityForCollections = (card: Card, names: string[], conditionsFilter: string[] = ["All"]) =>
  (card.collections || [])
    .filter((collection) => names.includes(collection.name))
    .reduce((sum, collection) => sum + (
      conditionsFilter.includes("All")
        ? getCollectionTotalQuantity(collection)
        : countCopies(collection.quantity, conditionsFilter)
    ), 0);

export type OwnedCounter = { collection: string; quantity: number };

/**
 * The owned badges on a card. A collection view shows one total for the viewed collection
 * and its subcollections, counted like the table does; elsewhere each collection selected
 * in the filter gets its own badge.
 */
export const ownedCountersForCard = (
  card: Card,
  viewMode: ViewMode,
  collections: OptionsCollection[],
  selectedCollections: string[],
  conditionsFilter: string[]
): OwnedCounter[] => {
  if (viewMode.kind === "collection") {
    const quantity = quantityForCollections(
      card,
      quantityCollectionNames(viewMode, collections, []),
      conditionsFilter
    );
    return quantity > 0 ? [{ collection: viewMode.name, quantity }] : [];
  }
  return activeFilterCollectionNames(selectedCollections)
    .map((collection) => {
      const match = card.collections?.find((item) => item.name === collection);
      return { collection, quantity: match ? getCollectionTotalQuantity(match) : 0 };
    })
    .filter((item) => item.quantity > 0);
};
