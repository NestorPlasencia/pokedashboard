import type { OptionsCollection } from "../types/dashboard";

/**
 * Ordering collections by the tags they carry.
 *
 * Two screens present collections this way - the Collections page and the catalog's
 * filter panel - so the rules live here rather than in either of them, where they could
 * drift into disagreeing about what "ordered by tag" means.
 */

/** The tags the shared schema recognises, in the order the app presents them. */
export const TAG_ORDER = ["own", "wish", "watch"] as const;

export type CollectionTagName = (typeof TAG_ORDER)[number];

type Tagged = Pick<OptionsCollection, "tags">;

/**
 * Where a collection sits when a list is ordered by tag.
 *
 * A collection carrying several tags takes its highest-ranked one, and an untagged one
 * ranks after every tagged collection rather than in among them.
 */
export const tagRank = (collection: Tagged): number => {
  const ranks = collection.tags
    .map((tag) => (TAG_ORDER as readonly string[]).indexOf(tag))
    .filter((rank) => rank >= 0);
  return ranks.length > 0 ? Math.min(...ranks) : TAG_ORDER.length;
};

/** Sorts by tag, leaving collections that share one in the order they arrived in. */
export const byTag = (left: Tagged, right: Tagged): number => tagRank(left) - tagRank(right);

export type TagSection<T> = {
  /** The tag this section holds, or null for the collections carrying none. */
  tag: CollectionTagName | null;
  label: string;
  items: T[];
};

const SECTION_LABELS: Record<string, string> = {
  own: "Own",
  wish: "Wish",
  watch: "Watch",
};

/**
 * The same collections split into one section per tag, plus a last one for the untagged.
 *
 * A collection appears once, under its highest-ranked tag. The checkbox that selects it is
 * the same control wherever it is drawn, so listing it in two sections would put two boxes
 * on screen that silently tick each other.
 *
 * Untagged collections get a section instead of being dropped: this list is also how a
 * collection is reached, and one that quietly vanished could never be selected again.
 */
export const groupByTag = <T extends Tagged>(collections: T[]): TagSection<T>[] => {
  // Indexed by rank, so `tagRank` picks the section directly - including the untagged one,
  // which it ranks at exactly TAG_ORDER.length.
  const sections: TagSection<T>[] = [
    ...TAG_ORDER.map((tag) => ({ tag, label: SECTION_LABELS[tag], items: [] as T[] })),
    { tag: null, label: "Untagged", items: [] as T[] },
  ];
  for (const collection of collections) {
    sections[tagRank(collection)].items.push(collection);
  }
  return sections;
};
