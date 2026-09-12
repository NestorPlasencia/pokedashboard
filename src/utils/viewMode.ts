import { parseUrlParams, type FilterParams } from './urlParams.ts';

/**
 * What the user is looking at. The three modes are mutually exclusive by construction:
 * there is no way to spell "a wishlist and a collection at the same time".
 */
export type ViewMode =
  | { kind: 'catalog' }
  | { kind: 'wishlist'; wishlistId: string; subcollectionId: string }
  // More than one collection can be browsed together; their cards are the union of all
  // of them. `names` is never empty - an empty selection falls back to the catalog.
  | { kind: 'collection'; names: string[] };

export const CATALOG_VIEW: ViewMode = { kind: 'catalog' };

/** Makes an unhandled mode a compile error instead of a silent fallthrough. */
export const assertNeverViewMode = (mode: never): never => {
  throw new Error(`Unhandled view mode: ${JSON.stringify(mode)}`);
};

/**
 * Read the browsing mode back from the URL. Anything missing, unknown or incomplete
 * falls back to the catalog rather than throwing, so a hand-edited link still loads.
 */
export const parseViewModeFromUrl = (): ViewMode => {
  const params = parseUrlParams();
  switch (params.viewMode) {
    case 'wishlist':
      return params.viewWishlist
        ? { kind: 'wishlist', wishlistId: params.viewWishlist, subcollectionId: params.viewSubcollection ?? '' }
        : CATALOG_VIEW;
    case 'collection':
      return params.viewedCollection && params.viewedCollection.length > 0
        ? { kind: 'collection', names: params.viewedCollection }
        : CATALOG_VIEW;
    default:
      return CATALOG_VIEW;
  }
};

/**
 * Add or remove one collection from what is being browsed. Several can be viewed at
 * once - their cards are the union - so this only ever touches the one name given.
 * Toggling one on from the catalog or a wishlist starts a fresh single-collection view;
 * toggling off the last one returns to the catalog, since an empty selection isn't one.
 */
export const toggleViewedCollection = (mode: ViewMode, name: string): ViewMode => {
  const names = mode.kind === 'collection' ? mode.names : [];
  if (names.includes(name)) {
    const remaining = names.filter((entry) => entry !== name);
    return remaining.length > 0 ? { kind: 'collection', names: remaining } : CATALOG_VIEW;
  }
  return { kind: 'collection', names: [...names, name] };
};

/**
 * The URL parameters for a mode. Every mode names all four keys - `undefined` deletes the
 * ones it does not use - so switching modes can never leave the previous one behind.
 */
export const viewModeToParams = (mode: ViewMode): Partial<FilterParams> => {
  switch (mode.kind) {
    case 'catalog':
      return { viewMode: undefined, viewWishlist: undefined, viewSubcollection: undefined, viewedCollection: undefined };
    case 'wishlist':
      return {
        viewMode: 'wishlist',
        viewWishlist: mode.wishlistId,
        viewSubcollection: mode.subcollectionId || undefined,
        viewedCollection: undefined,
      };
    case 'collection':
      return { viewMode: 'collection', viewWishlist: undefined, viewSubcollection: undefined, viewedCollection: mode.names };
    default:
      return assertNeverViewMode(mode);
  }
};
