import { parseUrlParams, type FilterParams } from './urlParams.ts';

/**
 * What the user is looking at. The three modes are mutually exclusive by construction:
 * there is no way to spell "a wishlist and a collection at the same time".
 */
export type ViewMode =
  | { kind: 'catalog' }
  | { kind: 'wishlist'; wishlistId: string; subcollectionId: string }
  | { kind: 'collection'; name: string };

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
      return params.viewedCollection ? { kind: 'collection', name: params.viewedCollection } : CATALOG_VIEW;
    default:
      return CATALOG_VIEW;
  }
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
      return { viewMode: 'collection', viewWishlist: undefined, viewSubcollection: undefined, viewedCollection: mode.name };
    default:
      return assertNeverViewMode(mode);
  }
};
