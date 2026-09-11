import type { HierarchySerie } from '../types/source-card';

/**
 * How the catalog's series and sets are ordered for people, newest first.
 *
 * `order` counts up from the oldest era (Base is 1, the current era the highest number
 * below this line), and within a series from its first set to its latest. From 90 on the
 * numbers stop being a timeline: POP, McDonald's, trainer kits, Japanese lines. Sorting
 * those in with the eras would put side releases - many of them empty - ahead of the
 * newest real set, so they keep their own order after every era.
 */
export const SPECIAL_SERIES_ORDER = 90;

const newestFirst = <T extends { order: number; name: string }>(a: T, b: T) =>
  b.order - a.order || a.name.localeCompare(b.name);

/** Every series, eras newest first and then the special lines; sets newest first. */
export const orderHierarchy = (hierarchy: HierarchySerie[]): HierarchySerie[] => {
  const withOrderedSets = hierarchy.map((serie) => ({ ...serie, sets: [...serie.sets].sort(newestFirst) }));
  const eras = withOrderedSets.filter((serie) => serie.order < SPECIAL_SERIES_ORDER).sort(newestFirst);
  const special = withOrderedSets
    .filter((serie) => serie.order >= SPECIAL_SERIES_ORDER)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return [...eras, ...special];
};

export type BrowsableHierarchy = { eras: HierarchySerie[]; special: HierarchySerie[] };

/**
 * The ordered hierarchy split for browsing. A series with no sets has nothing to open,
 * so it is left out here - the Filters panel still lists it.
 */
export const groupHierarchyForBrowsing = (hierarchy: HierarchySerie[]): BrowsableHierarchy => {
  const browsable = orderHierarchy(hierarchy).filter((serie) => serie.sets.length > 0);
  return {
    eras: browsable.filter((serie) => serie.order < SPECIAL_SERIES_ORDER),
    special: browsable.filter((serie) => serie.order >= SPECIAL_SERIES_ORDER),
  };
};
