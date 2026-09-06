import type { CollectionFilterOptions, PokemonGroupingOptions, SortConfig, ViewOptions } from '../types/dashboard';
import { orderToSortConfig } from './orders';
import { parseUrlParams, type FilterParams } from './urlParams';

/**
 * URL -> initial state for everything CardContext owns.
 *
 * Writing is spread across the sidebar components, so every parameter they write is read
 * back here. Each reader is tolerant: an unknown or malformed value falls back to the
 * default instead of breaking the boot.
 */

/** Keeps a restored value only when it is one the app actually understands. */
const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Parses a price bound, discarding anything that is not a usable number. */
const price = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const initialPriceRange = (params: FilterParams = parseUrlParams()): { min: number | null; max: number | null } => ({
  min: price(params.priceMin),
  max: price(params.priceMax),
});

export const initialSortConfig = (params: FilterParams = parseUrlParams()): SortConfig =>
  orderToSortConfig(params.order ?? 'None');

export const initialCollectionFilter = (params: FilterParams = parseUrlParams()): CollectionFilterOptions => {
  const limit = Number(params.limit ?? '1');
  return {
    enabled: params.filterByCollections === 'true',
    mode: oneOf(params.viewCollectionOption, ['none', 'hideOwned', 'hideNotOwned', 'shadowOwned', 'shadowNotOwned'] as const, 'none'),
    selectedCollections: params.collections ?? [],
    limit: Number.isFinite(limit) && limit >= 1 ? limit : 1,
    conditionsFilter: params.conditions?.length ? params.conditions : ['All'],
  };
};

export const initialPokemonGrouping = (params: FilterParams = parseUrlParams()): PokemonGroupingOptions => {
  const filterByCollection = params.filterByCollection ?? params.formsFilterByCollection;
  const legacyOwnership = params.hideObtainedPokedex === 'true' ? 'notOwned' : params.hideNotOwnPokedex === 'true' ? 'owned' : 'all';
  const groupingRegions = params.groupingRegions?.length ? params.groupingRegions : params.formsGroupingRegions;
  const allowVariants = params.formsAllowVariants?.length ? params.formsAllowVariants : params.formsEnabledVariants;
  return {
    // Backward compatible with the separate Pokédex and Forms toggles this replaced.
    enabled: params.pokemonGroupingEnabled === 'true' || params.groupByPokedex === 'true' || params.groupByForms === 'true',
    filterByCollection: oneOf(filterByCollection, ['all', 'owned', 'notOwned', 'ownedNone'] as const, legacyOwnership),
    groupingRegions: groupingRegions?.length ? groupingRegions : ['All'],
    allowVariants: allowVariants?.length ? allowVariants : ['Default'],
    hideVariants: params.formsHideVariants ?? [],
    groupSortBy: oneOf(params.formsGroupSortBy, ['default', 'cardCount', 'cardCountDesc', 'ownedCount', 'ownedCountDesc'] as const, 'default'),
    fallbackToDefault: params.formsFallbackToDefault === 'true',
  };
};

export const initialViewOptions = (params: FilterParams = parseUrlParams()): ViewOptions => {
  const grouped = initialPokemonGrouping(params).enabled;
  const mode = params.showTrendPoints === 'true' ? 'trend'
    : params.showTable === 'true' || params.showListTable === 'true' ? 'table'
      : 'cards';
  return {
    displayMode: `${mode}${grouped ? 'Grouped' : 'Ungrouped'}` as ViewOptions['displayMode'],
    trendSortDirection: oneOf(params.trendSortDirection, ['asc', 'desc'] as const, 'desc'),
    trendXAxisScale: oneOf(params.trendXAxisScale, ['normal', 'sectors'] as const, 'normal'),
    printTableImages: params.printTableImages === 'true',
    printTableQuantityMissing: params.printTableQuantityMissing === 'true',
    // These two default to on, so only an explicit "false" turns them off.
    printTableType: params.printTableType !== 'false',
    printTableVariant: params.printTableVariant !== 'false',
  };
};

/** The URL parameters describing a set of view options - the inverse of initialViewOptions. */
export const viewOptionsToParams = (viewOptions: ViewOptions): Partial<FilterParams> => {
  const isTable = viewOptions.displayMode.includes('table');
  const isTrend = viewOptions.displayMode.includes('trend');
  return {
    showTable: isTable ? 'true' : undefined,
    showListTable: isTable ? 'true' : undefined,
    showTrendPoints: isTrend ? 'true' : undefined,
    trendSortDirection: viewOptions.trendSortDirection,
    trendXAxisScale: viewOptions.trendXAxisScale,
    printTableImages: viewOptions.printTableImages ? 'true' : undefined,
    printTableQuantityMissing: viewOptions.printTableQuantityMissing ? 'true' : undefined,
    printTableType: viewOptions.printTableType ? undefined : 'false',
    printTableVariant: viewOptions.printTableVariant ? undefined : 'false',
  };
};
