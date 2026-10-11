import type { Card, OptionsCollection } from '../types/dashboard';
import { collectionSubtree } from './collectionTree.ts';
import { countCopies } from './copyCount.ts';

export type CollectionMark = { name: string; kind: 'owned' | 'wishlist' };
export type CollectionMarkIndex = Map<string, CollectionMark[]>;

/** Index each selected collection and its descendants once for all visible cards. */
export const buildCollectionMarkIndex = (collections: OptionsCollection[], names: string[]): CollectionMarkIndex => {
  const index: CollectionMarkIndex = new Map();
  for (const name of new Set(names)) {
    const subtree = collectionSubtree(collections, name);
    const root = subtree[0];
    if (!root) continue;
    const mark: CollectionMark = { name: root.name, kind: root.kind };
    for (const collection of subtree) {
      const marks = index.get(collection.name) ?? [];
      index.set(collection.name, [...marks, mark]);
    }
  }
  return index;
};

/** A visual annotation only: never change filtering, quantities, ordering or card data. */
export const collectionMarksForCard = (card: Card, index: CollectionMarkIndex): CollectionMark[] => {
  const matches = new Map<string, CollectionMark>();
  for (const entry of card.collections ?? []) {
    if (countCopies(entry.quantity) <= 0) continue;
    for (const mark of index.get(entry.name) ?? []) matches.set(mark.name, mark);
  }
  return [...matches.values()];
};

export const collectionMarkClass = (marks: CollectionMark[]): string =>
  !marks.length ? '' : marks.some(mark => mark.kind === 'wishlist')
    ? ' collection-marked collection-marked--wish' : ' collection-marked';
