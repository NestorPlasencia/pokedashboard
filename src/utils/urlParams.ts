/**
 * Utility functions for synchronizing filters with URL query parameters
 */
import { rememberUrl } from '../services/launchUrl.ts';
import { noteSearch } from './route.ts';

/**
 * The sidebar filters that carry a full include/exclude selection, named by their URL
 * parameter. Each one also gets `not…` (excluded values) and the four advanced-setting
 * parameters below, all derived from this list so the two directions cannot drift.
 */
export const FILTER_PARAM_NAMES = [
  'series', 'set', 'rarity', 'type', 'energy', 'pokedexRegion',
  'variants', 'cardVariantTopLevel', 'subtypes', 'artist',
] as const;

export type FilterParamName = (typeof FILTER_PARAM_NAMES)[number];

const capitalize = <T extends string>(value: T) =>
  `${value.charAt(0).toUpperCase()}${value.slice(1)}` as Capitalize<T>;

export const excludeParam = <T extends FilterParamName>(name: T) => `not${capitalize(name)}` as `not${Capitalize<T>}`;
export const includeModeParam = <T extends FilterParamName>(name: T) => `mode${capitalize(name)}` as `mode${Capitalize<T>}`;
export const excludeModeParam = <T extends FilterParamName>(name: T) => `xmode${capitalize(name)}` as `xmode${Capitalize<T>}`;
export const matchModeParam = <T extends FilterParamName>(name: T) => `match${capitalize(name)}` as `match${Capitalize<T>}`;
export const zeroCountParam = <T extends FilterParamName>(name: T) => `zero${capitalize(name)}` as `zero${Capitalize<T>}`;

type Capped = Capitalize<FilterParamName>;
/** `notSeries`, `notSet`, … - the values a filter excludes. */
export type ExcludeParamName = `not${Capped}`;
/** The per-filter advanced settings, only present when they differ from the default. */
export type FilterModeParamName = `mode${Capped}` | `xmode${Capped}` | `match${Capped}` | `zero${Capped}`;

const EXCLUDE_PARAM_NAMES = FILTER_PARAM_NAMES.map(excludeParam);
const FILTER_MODE_PARAM_NAMES: FilterModeParamName[] = FILTER_PARAM_NAMES.flatMap(name => [
  includeModeParam(name), excludeModeParam(name), matchModeParam(name), zeroCountParam(name),
]);

export interface FilterParams extends
  Partial<Record<ExcludeParamName, string[]>>,
  Partial<Record<FilterModeParamName, string>> {
  series?: string[];
  set?: string[];
  rarity?: string[];
  tags?: string[];
  type?: string[];
  energy?: string[];
  pokedexRegion?: string[];
  pokedexCompletion?: string[];
  variants?: string[];
  cardVariantTopLevel?: string[];
  conditions?: string[];
  subtypes?: string[];
  artist?: string[];
  collections?: string[];
  search?: string;
  order?: string;
  showTable?: string;
  showListTable?: string;
  showTrendPoints?: string;
  groupByPokedex?: string;
  hideNotOwnPokedex?: string;
  hideObtainedPokedex?: string;
  showOnlyMissing?: string;
  showOnlyIncomplete?: string;
  filterByCollections?: string;
  viewCollectionOption?: string;
  limit?: string;
  priceMin?: string;
  priceMax?: string;
  // New Pokédex filter parameters
  pokedexEnabled?: string;
  includeWithoutCards?: string;
  filterByCollection?: string;
  pokedexRegions?: string[];
  groupingRegions?: string[];
  // Pokemon Forms filter parameters (kept for backward compat + forms-specific)
  groupByForms?: string;
  formsFilterByCollection?: string;
  formsGroupingRegions?: string[];
  formsAllowVariants?: string[];
  formsHideVariants?: string[];
  formsGroupSortBy?: string;
  formsFallbackToDefault?: string;
  // Unified Pokemon Grouping parameters
  pokemonGroupingEnabled?: string;
  pokemonGroupingMode?: string;
  // Legacy parameter (backward compatibility)
  formsEnabledVariants?: string[];
  // View options that are not filters but still describe what you are looking at
  trendSortDirection?: string;
  trendXAxisScale?: string;
  printTableImages?: string;
  printTableQuantityMissing?: string;
  printTableType?: string;
  printTableVariant?: string;
  // Browsing mode. `viewedCollection` is the collection being browsed on its own and is
  // unrelated to `collections`, which is the collection *filter*.
  viewMode?: string;
  viewWishlist?: string;
  viewSubcollection?: string;
  /** One or more collections browsed together; their cards are the union of all of them. */
  viewedCollection?: string[];
  // Where card edits go, when armed. Each holds the id of its destination, so presence
  // means "armed" and the value says where - one parameter instead of a flag plus a
  // target that could disagree with it.
  addWishlist?: string;
  addCollection?: string;
}

/**
 * Booleans whose default is `true`, so only the "off" state belongs in the URL.
 */
const TRUE_BY_DEFAULT_PARAMS = ['printTableType', 'printTableVariant'] as const;

/**
 * Parse URL query parameters into filter state
 */
export const parseUrlParams = (): FilterParams => {
  const params = new URLSearchParams(window.location.search);
  
  const filters: FilterParams = {};
  
  // Helper function to decode URL values (underscores to spaces, 'and' to '&')
  // Note: URLSearchParams already decodes percent-encoded characters automatically,
  // but we need to handle our custom encoding (underscores for spaces)
  const decodeValue = (value: string): string => {
    return value.replace(/_/g, ' ').replace(/\band\b/g, '&');
  };
  
  // Parse array parameters (pipe-separated instead of comma to avoid encoding)
  // Note: These are now stored WITHOUT the "All" option - only specific selections
  const arrayParams = ['series', 'set', 'rarity', 'tags', 'type', 'energy', 'pokedexRegion', 'pokedexCompletion', 'variants', 'cardVariantTopLevel', 'conditions', 'subtypes', 'artist', 'collections', 'pokedexRegions', 'groupingRegions', 'formsGroupingRegions', 'formsAllowVariants', 'formsHideVariants', 'formsEnabledVariants', 'viewedCollection', ...EXCLUDE_PARAM_NAMES];
  
  arrayParams.forEach(param => {
    const value = params.get(param);
    if (value) {
      (filters as Record<string, string[]>)[param] = value.split('|').filter(v => v.length > 0).map(decodeValue);
    }
  });
  
  // Parse string parameters
  const search = params.get('search');
  if (search) {
    filters.search = decodeValue(search);
  }
  
  // Parse boolean parameters (stored as "true" or "false")
  const booleanParams = ['showTable', 'showListTable', 'showTrendPoints', 'groupByPokedex', 'hideNotOwnPokedex', 'hideObtainedPokedex', 'showOnlyMissing', 'showOnlyIncomplete', 'filterByCollections', 'pokedexEnabled', 'includeWithoutCards', 'groupByForms', 'pokemonGroupingEnabled', 'formsFallbackToDefault', 'printTableImages', 'printTableQuantityMissing', ...TRUE_BY_DEFAULT_PARAMS];
  booleanParams.forEach(param => {
    const value = params.get(param);
    if (value) {
      (filters as Record<string, string>)[param] = value;
    }
  });
  
  // Parse order parameter
  const order = params.get('order');
  if (order) {
    // Decode the order parameter properly - URLSearchParams already decodes it,
    // but we need to handle special characters like ↑ and ↓
    filters.order = decodeValue(order);
  }
  
  // Parse viewCollectionOption parameter
  const viewCollectionOption = params.get('viewCollectionOption');
  if (viewCollectionOption) {
    filters.viewCollectionOption = viewCollectionOption;
  }
  
  // Parse limit parameter
  const limit = params.get('limit');
  if (limit) {
    filters.limit = limit;
  }
  
  // Parse filterByCollection parameter
  const filterByCollection = params.get('filterByCollection');
  if (filterByCollection) {
    filters.filterByCollection = filterByCollection;
  }
  
  // Parse formsFilterByCollection parameter
  const formsFilterByCollection = params.get('formsFilterByCollection');
  if (formsFilterByCollection) {
    filters.formsFilterByCollection = formsFilterByCollection;
  }
  
  // Parse formsGroupSortBy parameter
  const formsGroupSortBy = params.get('formsGroupSortBy');
  if (formsGroupSortBy) {
    filters.formsGroupSortBy = formsGroupSortBy;
  }
  
  // Parse pokemonGroupingMode parameter
  const pokemonGroupingMode = params.get('pokemonGroupingMode');
  if (pokemonGroupingMode) {
    filters.pokemonGroupingMode = pokemonGroupingMode;
  }
  
  // Parse price parameters
  const priceMin = params.get('priceMin');
  if (priceMin) {
    filters.priceMin = priceMin;
  }
  
  const priceMax = params.get('priceMax');
  if (priceMax) {
    filters.priceMax = priceMax;
  }

  // Parse trend view parameters
  const trendSortDirection = params.get('trendSortDirection');
  if (trendSortDirection) {
    filters.trendSortDirection = trendSortDirection;
  }

  const trendXAxisScale = params.get('trendXAxisScale');
  if (trendXAxisScale) {
    filters.trendXAxisScale = trendXAxisScale;
  }

  // Parse the per-filter advanced settings
  FILTER_MODE_PARAM_NAMES.forEach(param => {
    const value = params.get(param);
    if (value) {
      (filters as Record<string, string>)[param] = value;
    }
  });

  // Parse the armed edit destinations
  const addWishlist = params.get('addWishlist');
  if (addWishlist) {
    filters.addWishlist = addWishlist;
  }

  const addCollection = params.get('addCollection');
  if (addCollection) {
    filters.addCollection = addCollection;
  }

  // Parse browsing mode parameters
  const viewMode = params.get('viewMode');
  if (viewMode) {
    filters.viewMode = viewMode;
  }

  const viewWishlist = params.get('viewWishlist');
  if (viewWishlist) {
    filters.viewWishlist = viewWishlist;
  }

  const viewSubcollection = params.get('viewSubcollection');
  if (viewSubcollection) {
    filters.viewSubcollection = viewSubcollection;
  }

  return filters;
};

/**
 * Generate URL query string from filter state
 * Only includes non-"All" values to keep URLs clean
 * Manually builds URL to avoid URLSearchParams encoding
 */
export const generateUrlParams = (filters: Partial<FilterParams>): string => {
  const queryParts: string[] = [];
  
  // Add array parameters - but SKIP "All" values
  const arrayParams: (keyof FilterParams)[] = ['series', 'set', 'rarity', 'tags', 'type', 'energy', 'pokedexRegion', 'pokedexCompletion', 'variants', 'cardVariantTopLevel', 'conditions', 'subtypes', 'artist', 'collections', 'pokedexRegions', 'groupingRegions', 'formsGroupingRegions', 'formsAllowVariants', 'formsHideVariants', 'formsEnabledVariants', 'viewedCollection', ...EXCLUDE_PARAM_NAMES];
  
  arrayParams.forEach(param => {
    const value = filters[param];
    if (value && Array.isArray(value) && value.length > 0) {
      // Filter out "All" from the array to keep URL clean
      const filteredValues = value.filter(v => v !== 'All');
      if (filteredValues.length > 0) {
        // Replace spaces with underscores and & with 'and' for cleaner URLs
        const cleanedValues = filteredValues.map(v => 
          v.replace(/\s+/g, '_').replace(/&/g, 'and')
        );
        // Use pipe (|) as separator without encoding
        queryParts.push(`${param}=${cleanedValues.join('|')}`);
      }
    }
  });
  
  // Add string parameters
  if (filters.search && filters.search.length > 0) {
    const cleanSearch = filters.search.replace(/\s+/g, '_').replace(/&/g, 'and');
    queryParts.push(`search=${cleanSearch}`);
  }
  
  // Add order parameter
  if (filters.order && filters.order !== 'None') {
    const cleanOrder = filters.order.replace(/\s+/g, '_');
    queryParts.push(`order=${cleanOrder}`);
  }
  
  // Add boolean parameters (only if true)
  if (filters.showTable === 'true') {
    queryParts.push('showTable=true');
  }
  if (filters.showListTable === 'true') {
    queryParts.push('showListTable=true');
  }
  if (filters.showTrendPoints === 'true') {
    queryParts.push('showTrendPoints=true');
  }
  if (filters.groupByPokedex === 'true') {
    queryParts.push('groupByPokedex=true');
  }
  if (filters.hideNotOwnPokedex === 'true') {
    queryParts.push('hideNotOwnPokedex=true');
  }
  if (filters.hideObtainedPokedex === 'true') {
    queryParts.push('hideObtainedPokedex=true');
  }
  if (filters.showOnlyMissing === 'true') {
    queryParts.push('showOnlyMissing=true');
  }
  if (filters.showOnlyIncomplete === 'true') {
    queryParts.push('showOnlyIncomplete=true');
  }
  if (filters.filterByCollections === 'true') {
    queryParts.push('filterByCollections=true');
  }
  if (filters.pokedexEnabled === 'true') {
    queryParts.push('pokedexEnabled=true');
  }
  if (filters.includeWithoutCards === 'true') {
    queryParts.push('includeWithoutCards=true');
  }
  if (filters.groupByForms === 'true') {
    queryParts.push('groupByForms=true');
  }
  if (filters.pokemonGroupingEnabled === 'true') {
    queryParts.push('pokemonGroupingEnabled=true');
  }
  if (filters.formsFallbackToDefault === 'true') {
    queryParts.push('formsFallbackToDefault=true');
  }
  
  // Add viewCollectionOption parameter
  if (filters.viewCollectionOption && filters.viewCollectionOption !== 'none') {
    queryParts.push(`viewCollectionOption=${filters.viewCollectionOption}`);
  }
  
  // Add limit parameter (only if not default value of 1)
  if (filters.limit && filters.limit !== '1') {
    queryParts.push(`limit=${filters.limit}`);
  }
  
  // Add filterByCollection parameter
  if (filters.filterByCollection && filters.filterByCollection !== 'all') {
    queryParts.push(`filterByCollection=${filters.filterByCollection}`);
  }
  
  // Add formsFilterByCollection parameter
  if (filters.formsFilterByCollection && filters.formsFilterByCollection !== 'all') {
    queryParts.push(`formsFilterByCollection=${filters.formsFilterByCollection}`);
  }
  
  // Add formsGroupSortBy parameter
  if (filters.formsGroupSortBy && filters.formsGroupSortBy !== 'default') {
    queryParts.push(`formsGroupSortBy=${filters.formsGroupSortBy}`);
  }
  
  // Add pokemonGroupingMode parameter
  if (filters.pokemonGroupingMode && filters.pokemonGroupingMode !== 'pokedex') {
    queryParts.push(`pokemonGroupingMode=${filters.pokemonGroupingMode}`);
  }
  
  // Add price parameters
  if (filters.priceMin) {
    queryParts.push(`priceMin=${filters.priceMin}`);
  }
  
  if (filters.priceMax) {
    queryParts.push(`priceMax=${filters.priceMax}`);
  }

  // Add trend view parameters (only when they differ from their defaults)
  if (filters.trendSortDirection && filters.trendSortDirection !== 'desc') {
    queryParts.push(`trendSortDirection=${filters.trendSortDirection}`);
  }
  if (filters.trendXAxisScale && filters.trendXAxisScale !== 'normal') {
    queryParts.push(`trendXAxisScale=${filters.trendXAxisScale}`);
  }

  // Add print column toggles. Images and Quantity default to off, Type and Variant to on,
  // so each one only appears once it stops matching its default.
  if (filters.printTableImages === 'true') {
    queryParts.push('printTableImages=true');
  }
  if (filters.printTableQuantityMissing === 'true') {
    queryParts.push('printTableQuantityMissing=true');
  }
  TRUE_BY_DEFAULT_PARAMS.forEach(param => {
    if (filters[param] === 'false') {
      queryParts.push(`${param}=false`);
    }
  });

  // Add the per-filter advanced settings. The writer only fills these in when they leave
  // their default, so a filter at its defaults contributes nothing to the URL.
  FILTER_MODE_PARAM_NAMES.forEach(param => {
    const value = filters[param];
    if (value) {
      queryParts.push(`${param}=${value}`);
    }
  });

  // Add the armed edit destinations. Nothing armed writes nothing.
  if (filters.addWishlist) {
    queryParts.push(`addWishlist=${filters.addWishlist}`);
  }
  if (filters.addCollection) {
    queryParts.push(`addCollection=${filters.addCollection}`);
  }

  // Add the browsing mode. Building it from one branch per mode keeps the URL from ever
  // describing two modes at once, whatever the merged parameters happen to hold.
  if (filters.viewMode === 'wishlist' && filters.viewWishlist) {
    queryParts.push('viewMode=wishlist');
    queryParts.push(`viewWishlist=${filters.viewWishlist}`);
    if (filters.viewSubcollection) {
      queryParts.push(`viewSubcollection=${filters.viewSubcollection}`);
    }
  } else if (filters.viewMode === 'collection' && filters.viewedCollection && filters.viewedCollection.length > 0) {
    // viewedCollection itself is pushed by the array-params loop above.
    queryParts.push('viewMode=collection');
  }

  return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
};

/**
 * Update browser URL with new filters (using History API)
 * Merges new filters with existing URL parameters
 */
export const updateUrlParams = (filters: Partial<FilterParams>): void => {
  // Get current URL params
  const currentParams = parseUrlParams();
  
  // Merge with new filters, but only for keys that are explicitly provided
  const mergedFilters: Partial<FilterParams> = { ...currentParams };
  
  // Only update the keys that are explicitly in the filters object
  Object.keys(filters).forEach(key => {
    const typedKey = key as keyof FilterParams;
    const value = filters[typedKey];
    
    // If the value is undefined or null, remove it from the URL
    if (value === undefined || value === null) {
      delete mergedFilters[typedKey];
    } else {
      // @ts-expect-error - TypeScript is confused about the union types
      mergedFilters[typedKey] = value;
    }
  });
  
  const queryString = generateUrlParams(mergedFilters);
  const newUrl = `${window.location.pathname}${queryString}`;
  
  window.history.replaceState({ filters: mergedFilters }, '', newUrl);
  noteSearch(queryString);
  // Installed launches start at the manifest's start_url, so the only way back to this
  // state is to have remembered it.
  rememberUrl();
};

/**
 * Initialize filters from URL or return defaults
 */

export const initializeFiltersFromUrl = (): FilterParams => {
  const urlParams = parseUrlParams();

  return {
    // Everything parsed passes through untouched; the entries below only add a default
    // where one is needed. Listing keys by hand instead meant a parameter added later -
    // the per-filter exclusions and modes, say - was written to the URL and then read
    // back from an object that never carried it.
    ...urlParams,
    series: urlParams.series?.length ? urlParams.series : ['All'],
    set: urlParams.set?.length ? urlParams.set : ['All'],
    rarity: urlParams.rarity?.length ? urlParams.rarity : ['All'],
    tags: urlParams.tags?.length ? urlParams.tags : ['All'],
    type: urlParams.type?.length ? urlParams.type : ['All'],
    energy: urlParams.energy?.length ? urlParams.energy : ['All'],
    pokedexRegion: urlParams.pokedexRegion?.length ? urlParams.pokedexRegion : ['All'],
    pokedexCompletion: urlParams.pokedexCompletion?.length ? urlParams.pokedexCompletion : ['All'],
    variants: urlParams.variants?.length ? urlParams.variants : ['All'],
    cardVariantTopLevel: urlParams.cardVariantTopLevel?.length ? urlParams.cardVariantTopLevel : ['All'],
    conditions: urlParams.conditions?.length ? urlParams.conditions : ['All'],
    subtypes: urlParams.subtypes?.length ? urlParams.subtypes : ['All'],
    artist: urlParams.artist?.length ? urlParams.artist : ['All'],
    collections: urlParams.collections?.length ? urlParams.collections : [],
    search: urlParams.search || '',
    order: urlParams.order || 'None',
    showTable: urlParams.showTable || 'false',
    showListTable: urlParams.showListTable || 'false',
    showTrendPoints: urlParams.showTrendPoints || 'false',
    groupByPokedex: urlParams.groupByPokedex || 'false',
    hideNotOwnPokedex: urlParams.hideNotOwnPokedex || 'false',
    hideObtainedPokedex: urlParams.hideObtainedPokedex || 'false',
    showOnlyMissing: urlParams.showOnlyMissing || 'false',
    showOnlyIncomplete: urlParams.showOnlyIncomplete || 'false',
    filterByCollections: urlParams.filterByCollections || 'false',
    viewCollectionOption: urlParams.viewCollectionOption || 'none',
    limit: urlParams.limit || '1',
    priceMin: urlParams.priceMin || undefined,
    priceMax: urlParams.priceMax || undefined,
    pokedexEnabled: urlParams.pokedexEnabled || 'false',
    includeWithoutCards: urlParams.includeWithoutCards || 'false',
    filterByCollection: urlParams.filterByCollection || 'all',
    pokedexRegions: urlParams.pokedexRegions?.length ? urlParams.pokedexRegions : ['All'],
    groupingRegions: urlParams.groupingRegions?.length ? urlParams.groupingRegions : ['All'],
    formsAllowVariants: urlParams.formsAllowVariants?.length ? urlParams.formsAllowVariants : (urlParams.formsEnabledVariants?.length ? urlParams.formsEnabledVariants : []),
    formsHideVariants: urlParams.formsHideVariants?.length ? urlParams.formsHideVariants : [],
  };
};
