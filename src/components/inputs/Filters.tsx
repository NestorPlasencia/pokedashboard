import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterOption, Card } from "../../types/dashboard";
import type { HierarchySerie } from "../../types/source-card";
import { useCardContext } from "../../context/CardContext";
import { filterCardsByProperty, filterCardsByPokedexCompletion, excludeCardsByProperty } from "../../utils/filters";
import { arraysEqual, getUniqueValuesFromProperty, countAllValuesFromProperty } from "../../utils/utils";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { CollapseAllButton, CollapsibleGroup } from "../ui/CollapsibleGroup";
import { DEFAULT_RARITIES_ORDER, DEFAULT_ENERGY_TYPES_ORDER, POKEDEX_REGIONS, DEFAULT_POKEDEX_REGIONS_ORDER, DEFAULT_VARIANTS_ORDER } from "../../constants/constants";
import { updateUrlParams, initializeFiltersFromUrl, type FilterParamName } from "../../utils/urlParams";
import { filterSettingsToParams, initialFilterSettings } from "../../utils/urlState";
import { loadHierarchy } from "../../services/cards";
import { orderHierarchy } from "../../utils/hierarchy";

/**
 * The URL parameter each filter reads and writes. One map serves both directions, so a
 * filter cannot be saved under one name and restored under another.
 */
const PARAM_BY_PROPERTY: Partial<Record<FilterOption['property'], FilterParamName>> = {
  setSeries: 'series',
  setNames: 'set',
  rarities: 'rarity',
  cardType: 'type',
  types: 'energy',
  pokedexRegion: 'pokedexRegion',
  variant: 'variants',
  cardVariantTopLevel: 'cardVariantTopLevel',
  subtypes: 'subtypes',
  artist: 'artist',
};

type OptionState = 'neutral' | 'included' | 'excluded';
type SelectionMode = 'include' | 'exclude';

const normalizeFromUrl = (values?: string[]) => {
  if (!values || values.length === 0) return [];
  return values.filter((value) => value !== 'All');
};

const toLegacyChecked = (includedValues: string[]) => includedValues.length > 0 ? includedValues : ['All'];

const normalizeLabel = (label: string) => label.replace(':', '').trim();

const renderCollapsedChips = (
  values: string[],
  type: 'include' | 'exclude',
  onRemoveValue: (value: string) => void
) => {
  const visibleValues = values.slice(0, 2);
  const remaining = values.length - visibleValues.length;

  return (
    <div className="filter-collapsed-group">
      <span className="filter-collapsed-group-title">{type === 'include' ? 'Includes' : 'Excludes'}</span>
      {visibleValues.map((value) => (
        <button
          key={`${type}-${value}`}
          type="button"
          className={`filter-collapsed-chip filter-collapsed-chip-button ${type}`}
          onClick={() => onRemoveValue(value)}
          aria-label={`Remove ${type === 'include' ? 'included' : 'excluded'} value ${value}`}
        >
          {value} ×
        </button>
      ))}
      {remaining > 0 && (
        <span className="filter-collapsed-chip more">+{remaining}</span>
      )}
    </div>
  );
};

export const Filters = () => {
  const {
    allCards,
    setFilteredCards,
    variantsFilter,
    setVariantsFilter,
    setPokemonGrouping,
    setPriceRange,
    setCollectionFilter,
    setSortConfig,
    setViewOptions,
    seriesSelection,
    setSeriesSelection,
    viewMode,
    catalogSelectionRequest,
    requestCatalogSelection,
    setSelectedSets
  } = useCardContext();

  // Track if this is the first render to avoid overwriting URL params on initial load
  const isInitialRender = useRef(true);
  const hierarchyRef = useRef<HierarchySerie[]>([]);

  // Load hierarchy: set series order and store full hierarchy for set ordering. In a
  // collection view, keep only the series containing one of the collection's set names.
  useEffect(() => {
    let cancelled = false;
    loadHierarchy().then((hierarchy) => {
      if (cancelled) return;
      const orderedHierarchy = orderHierarchy(hierarchy);
      hierarchyRef.current = orderedHierarchy;
      const orderedSeriesNames = orderedHierarchy.map((s) => s.name);
      const collectionSetNames = new Set(
        allCards.flatMap((card) => [card.setName, ...(card.setNames || [])]).filter(Boolean)
      );
      const availableSeriesNames = viewMode.kind === 'collection'
        ? allCards.length > 0
          ? orderedHierarchy
              .filter((serie) => serie.sets.some((set) => collectionSetNames.has(set.name)))
              .map((serie) => serie.name)
          : []
        : orderedSeriesNames;
      const availableSeries = new Set(availableSeriesNames);
      // Build global ordered set names across all series
      const allOrderedSetNames = orderedHierarchy.flatMap((s) => s.sets.map((set) => set.name));
      setFilters((prev) => {
        let changed = false;
        const next = prev.map((f) => {
          if (f.property === 'setSeries') {
            const shouldPruneSelection = viewMode.kind === 'collection' && allCards.length > 0;
            const includedValues = shouldPruneSelection
              ? f.includedValues.filter((value) => availableSeries.has(value))
              : f.includedValues;
            const excludedValues = shouldPruneSelection
              ? f.excludedValues.filter((value) => availableSeries.has(value))
              : f.excludedValues;
            if (
              !arraysEqual(f.options, availableSeriesNames) ||
              !arraysEqual(f.defaultOrder || [], availableSeriesNames) ||
              !arraysEqual(f.includedValues, includedValues) ||
              !arraysEqual(f.excludedValues, excludedValues)
            ) {
              changed = true;
              return {
                ...f,
                options: availableSeriesNames,
                defaultOrder: availableSeriesNames,
                includedValues,
                excludedValues,
              };
            }
            return f;
          }
          if (f.property === 'setNames' && !arraysEqual(f.defaultOrder || [], allOrderedSetNames)) {
            changed = true;
            return { ...f, defaultOrder: allOrderedSetNames };
          }
          return f;
        });
        return changed ? next : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [allCards, viewMode.kind]);

  const [globalSelectionModes, setGlobalSelectionModes] = useState<Record<number, SelectionMode>>({});
  const [optionSearchByFilter, setOptionSearchByFilter] = useState<Record<number, string>>({});
  const [searchVisibleByFilter, setSearchVisibleByFilter] = useState<Record<number, boolean>>({})

  // Inicializar filtros desde URL usando una función de inicialización
  const [filters, setFilters] = useState<FilterOption[]>(() => {
    const urlFilters = initializeFiltersFromUrl();

    // Included values, excluded values and the advanced settings all come from the same
    // parameter family, so a restored filter is the whole filter and not just its checkboxes.
    const buildFilter = (
      order: number,
      label: string,
      property: FilterOption['property'],
      param: FilterParamName,
      isMultiValue: boolean,
      options: string[] = [],
      defaultOrder?: string[]
    ): FilterOption => ({
      order,
      label,
      property,
      options,
      includedValues: normalizeFromUrl(urlFilters[param]),
      ...initialFilterSettings(param, urlFilters),
      isMultiValue,
      defaultOrder,
    });

    // Each filter narrows the options of the ones after it, so this order is also the
    // cascade.
    return [
      buildFilter(1, "Series:", "setSeries", 'series', false),
      buildFilter(2, "Set:", "setNames", 'set', true),
      buildFilter(3, "Rarity:", "rarities", 'rarity', true, [], DEFAULT_RARITIES_ORDER),
      buildFilter(
        4,
        "Variant:",
        "cardVariantTopLevel",
        'cardVariantTopLevel',
        false,
        [],
        DEFAULT_VARIANTS_ORDER
      ),
      buildFilter(
        5,
        "Variants:",
        "variant",
        'variants',
        false,
        [],
        DEFAULT_VARIANTS_ORDER
      ),
      buildFilter(6, "Type / Supertype:", "cardType", 'type', false),
      buildFilter(7, "Subtypes:", "subtypes", 'subtypes', true),
      buildFilter(8, "Energy:", "types", 'energy', true, [], DEFAULT_ENERGY_TYPES_ORDER),
      buildFilter(
        9,
        "Region:",
        "pokedexRegion",
        'pokedexRegion',
        false,
        POKEDEX_REGIONS.map((region) => region.name),
        DEFAULT_POKEDEX_REGIONS_ORDER
      ),
      buildFilter(10, "Artist:", "artist", 'artist', false)
    ];
  });

  // When series selection changes, update setNames defaultOrder to match hierarchy order of those series
  const selectedSeriesValues = filters.find((f) => f.property === 'setSeries')?.includedValues;
  const excludedSeriesValues = filters.find((f) => f.property === 'setSeries')?.excludedValues;

  useEffect(() => {
    const included = selectedSeriesValues || [];
    const excluded = excludedSeriesValues || [];
    setSeriesSelection((current) => {
      if (arraysEqual(current.included, included) && arraysEqual(current.excluded, excluded)) {
        return current;
      }
      return { included, excluded };
    });
  }, [excludedSeriesValues, selectedSeriesValues, setSeriesSelection]);

  useEffect(() => {
    setFilters((currentFilters) => {
      const seriesFilter = currentFilters.find((filter) => filter.property === 'setSeries');
      if (
        seriesFilter &&
        arraysEqual(seriesFilter.includedValues, seriesSelection.included) &&
        arraysEqual(seriesFilter.excludedValues, seriesSelection.excluded)
      ) {
        return currentFilters;
      }

      return currentFilters.map((filter) =>
        filter.property === 'setSeries'
          ? {
              ...filter,
              includedValues: seriesSelection.included,
              excludedValues: seriesSelection.excluded
            }
          : filter
      );
    });
  }, [seriesSelection]);

  // A selection change made outside the sidebar - the starting screen, the breadcrumb - is
  // applied here, so it reaches the URL and the loader like any other. A field the request
  // leaves out keeps its current selection.
  useEffect(() => {
    if (!catalogSelectionRequest) return;
    const { series, sets } = catalogSelectionRequest;
    setFilters((prev) =>
      prev.map((f) => {
        if (f.property === 'setSeries' && series) {
          return { ...f, includedValues: series.included, excludedValues: series.excluded };
        }
        if (f.property === 'setNames' && sets) return { ...f, includedValues: sets, excludedValues: [] };
        return f;
      })
    );
    requestCatalogSelection(null);
  }, [catalogSelectionRequest, requestCatalogSelection]);

  // The catalog and a collection are different scopes. A series or set chosen to browse the
  // catalog would otherwise carry into a collection and hide most of it with no sign of
  // why, so each keeps its own series and set selection, swapped when the view changes.
  // Every other filter is shared between the two.
  const selectionScope = viewMode.kind === 'collection' ? 'collection' : 'catalog';
  const currentScope = useRef<typeof selectionScope>(selectionScope);
  const selectionsByScope = useRef<Partial<Record<typeof selectionScope, Pick<FilterOption, 'includedValues' | 'excludedValues'>[]>>>({});
  useEffect(() => {
    const previous = currentScope.current;
    if (previous === selectionScope) return;
    currentScope.current = selectionScope;
    const scoped = ['setSeries', 'setNames'] as const;
    selectionsByScope.current[previous] = scoped.map((property) => {
      const filter = filters.find((f) => f.property === property);
      return { includedValues: filter?.includedValues ?? [], excludedValues: filter?.excludedValues ?? [] };
    });
    const restored = selectionsByScope.current[selectionScope];
    setFilters((prev) =>
      prev.map((f) => {
        const index = scoped.indexOf(f.property as (typeof scoped)[number]);
        if (index === -1) return f;
        return {
          ...f,
          includedValues: restored?.[index].includedValues ?? [],
          excludedValues: restored?.[index].excludedValues ?? [],
        };
      })
    );
    // Only a change of scope swaps the selection; reading the latest filters is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionScope]);

  // The breadcrumb names the chosen sets, and only this panel holds them.
  const selectedSetValues = filters.find((f) => f.property === 'setNames')?.includedValues;
  useEffect(() => {
    setSelectedSets(selectedSetValues ?? []);
  }, [selectedSetValues, setSelectedSets]);

  useEffect(() => {
    if (hierarchyRef.current.length === 0) return;

    // hierarchyRef already holds the hierarchy newest first, sets included.
    const orderedSetNames = hierarchyRef.current
      .filter((s) => !selectedSeriesValues || selectedSeriesValues.length === 0 || selectedSeriesValues.includes(s.name))
      .flatMap((s) => s.sets.map((set) => set.name));

    setFilters((prev) =>
      prev.map((f) =>
        f.property === 'setNames' ? { ...f, defaultOrder: orderedSetNames } : f
      )
    );
  }, [selectedSeriesValues]);

  const globalOptionCountsByFilter = useMemo(() => {
    const counts: Record<number, Record<string, number>> = {};
    filters.forEach((filter) => {
      if (filter.property === 'pokedexCompletion' || filter.property === 'conditions') {
        counts[filter.order] = {};
        return;
      }
      counts[filter.order] = countAllValuesFromProperty(
        allCards,
        filter.property as keyof Card
      );
    });
    return counts;
  }, [filters, allCards]);

  const contextualOptionCountsByFilter = useMemo(() => {
    const counts: Record<number, Record<string, number>> = {};

    filters.forEach((targetFilter) => {
      if (targetFilter.property === 'pokedexCompletion' || targetFilter.property === 'conditions') {
        counts[targetFilter.order] = {};
        return;
      }

      let contextualCards = [...allCards];

      filters.forEach((filter) => {
        if (filter.order === targetFilter.order) return;

        if (filter.property === 'pokedexCompletion') {
          contextualCards = filterCardsByPokedexCompletion(
            contextualCards,
            toLegacyChecked(filter.includedValues)
          );
          return;
        }

        contextualCards = filterCardsByProperty(
          contextualCards,
          filter.property as keyof Card,
          toLegacyChecked(filter.includedValues)
        );

        if (filter.excludedValues.length > 0) {
          contextualCards = excludeCardsByProperty(
            contextualCards,
            filter.property as keyof Card,
            filter.excludedValues
          );
        }
      });

      counts[targetFilter.order] = countAllValuesFromProperty(
        contextualCards,
        targetFilter.property as keyof Card
      );
    });

    return counts;
  }, [filters, allCards]);

  const sortByDefaultOrder = useCallback((options: string[], defaultOrder?: string[]) => {
    if (!defaultOrder || defaultOrder.length === 0) return options;
    const max = Number.MAX_SAFE_INTEGER;
    const idx = (v: string) => {
      const i = defaultOrder.indexOf(v);
      return i === -1 ? max : i;
    };
    return [...options].sort((a, b) => {
      const ai = idx(a);
      const bi = idx(b);
      if (ai === bi) {
        // Unknown values at the end, sorted alphabetically
        if (ai === max) return a.localeCompare(b);
        return 0;
      }
      return ai - bi;
    });
  }, []);

  const updateFilterOptions = useCallback((
    index: number,
    nextFilter: FilterOption,
    newOptions: string[]
  ) => {
    // Order options by defaultOrder if provided in filter config
    const orderedOptions = sortByDefaultOrder(newOptions, nextFilter.defaultOrder);

    if (!arraysEqual(nextFilter.options, orderedOptions)) {
      setFilters((prevFilters) => {
        const updatedFilters = [...prevFilters];
        updatedFilters[index + 1] = {
          ...updatedFilters[index + 1],
          options: orderedOptions,
        };
        return updatedFilters;
      });
    }
  }, [sortByDefaultOrder]);

  useEffect(() => {

    if (allCards.length > 0) {
      let currentCards = [...allCards];
      filters.forEach((filter: FilterOption, index) => {
        if (index == 0) {
          const filter = filters[index];
          // Skip special handling for pokedexCompletion on initial setup
          if (filter.property !== 'pokedexCompletion' && filter.property !== 'setSeries') {
            const options = getUniqueValuesFromProperty(allCards, filter.property as keyof Card);
            updateFilterOptions(-1, filter, options);
          }
        }

        // Handle pokedexCompletion specially
        if (filter.property === 'pokedexCompletion') {
          currentCards = filterCardsByPokedexCompletion(currentCards, toLegacyChecked(filter.includedValues));
        } else {
          const filtered = filterCardsByProperty(
            currentCards,
            filter.property as keyof Card,
            toLegacyChecked(filter.includedValues)
          );
          currentCards = filtered;

          // Apply excluded values
          if (filter.excludedValues.length > 0) {
            currentCards = excludeCardsByProperty(
              currentCards,
              filter.property as keyof Card,
              filter.excludedValues
            );
          }
        }

        if (index < filters.length - 1) {
          const nextFilter = filters[index + 1];
          // Skip options calculation for pokedexCompletion - options are fixed
          if (nextFilter.property !== 'pokedexCompletion') {
            const newOptions = getUniqueValuesFromProperty(
              currentCards,
              nextFilter.property as keyof Card
            );
            updateFilterOptions(index, nextFilter, newOptions);
          }
        }
      });

      // Set filtered cards - price filter will be applied by useCardFilters hook
      // Guard: don't show cards until a series is explicitly selected
      const seriesFilterState = filters.find(f => f.property === 'setSeries');
      if (
        viewMode.kind === 'catalog' &&
        seriesFilterState &&
        seriesFilterState.includedValues.length === 0 &&
        seriesFilterState.excludedValues.length === 0
      ) {
        setFilteredCards([]);
        return;
      }
      setFilteredCards(currentCards);
    }
  }, [allCards, filters, setFilteredCards, updateFilterOptions, variantsFilter, viewMode.kind]);

  // Sincronizar URL cuando cambian TODOS los filtros
  useEffect(() => {
    // Skip URL update on initial render to preserve URL params like priceMin/priceMax
    if (isInitialRender.current) {
      isInitialRender.current = false;

      return;
    }

    // Everything a filter holds goes back out under the same parameter family it was
    // read from. Values at their default resolve to `undefined` and leave no trace.
    let urlParams: Partial<Parameters<typeof updateUrlParams>[0]> = {};

    filters.forEach((filter) => {
      const param = PARAM_BY_PROPERTY[filter.property];
      if (!param) return;
      urlParams = {
        ...urlParams,
        [param]: toLegacyChecked(filter.includedValues),
        ...filterSettingsToParams(param, filter),
      };
    });

    // IMPORTANT: Don't include priceMin/priceMax here - they're managed by PriceRangeFilter
    // to avoid overwriting them when filters change
    updateUrlParams(urlParams);
  }, [filters]);

  const handleOptionStateChange = (order: number, option: string, state: OptionState) => {
    setFilters((prevFilters) => {
      return prevFilters.map((filter) => {
        if (filter.order !== order) return filter;

        const includedSet = new Set(filter.includedValues);
        const excludedSet = new Set(filter.excludedValues);

        includedSet.delete(option);
        excludedSet.delete(option);

        if (state === 'included') {
          includedSet.add(option);
        }

        if (state === 'excluded') {
          excludedSet.add(option);
        }

        return {
          ...filter,
          includedValues: Array.from(includedSet),
          excludedValues: Array.from(excludedSet),
        };
      });
    });
  };

  const handleGlobalModeChange = (order: number, mode: SelectionMode) => {
    setGlobalSelectionModes((prev) => ({
      ...prev,
      [order]: mode,
    }));
  };

  const handleQuickToggle = (order: number, option: string, currentState: OptionState) => {
    const mode = globalSelectionModes[order] || 'include';

    if (mode === 'include') {
      const nextState = currentState === 'included' ? 'neutral' : 'included';
      handleOptionStateChange(order, option, nextState);
      return;
    }

    const nextState = currentState === 'excluded' ? 'neutral' : 'excluded';
    handleOptionStateChange(order, option, nextState);
  };

  const handleSearchChange = (order: number, query: string) => {
    setOptionSearchByFilter((prev) => ({
      ...prev,
      [order]: query,
    }));
  };

  const handleSearchToggle = (order: number) => {
    setSearchVisibleByFilter((prev) => {
      const isCurrentlyVisible = prev[order] || false;
      const nextValue = !isCurrentlyVisible;

      if (!nextValue) {
        setOptionSearchByFilter((prevSearch) => ({
          ...prevSearch,
          [order]: '',
        }));
      }

      return {
        ...prev,
        [order]: nextValue,
      };
    });
  };

  const handleSelectAll = (order: number, options: string[]) => {
    const mode = globalSelectionModes[order] || 'include';

    setFilters((prevFilters) => prevFilters.map((f) => {
      if (f.order !== order) return f;

      if (mode === 'include') {
        const allSelected = options.length > 0 && options.every(opt => f.includedValues.includes(opt));
        if (allSelected) {
          return { ...f, includedValues: f.includedValues.filter(v => !options.includes(v)) };
        }
        return {
          ...f,
          includedValues: [...new Set([...f.includedValues, ...options])],
          excludedValues: f.excludedValues.filter(v => !options.includes(v)),
        };
      } else {
        const allExcluded = options.length > 0 && options.every(opt => f.excludedValues.includes(opt));
        if (allExcluded) {
          return { ...f, excludedValues: f.excludedValues.filter(v => !options.includes(v)) };
        }
        return {
          ...f,
          excludedValues: [...new Set([...f.excludedValues, ...options])],
          includedValues: f.includedValues.filter(v => !options.includes(v)),
        };
      }
    }));
  };

  const handleFilterConfigChange = <K extends keyof FilterOption>(order: number, key: K, value: FilterOption[K]) => {
    setFilters((prevFilters) => prevFilters.map((filter) => (
      filter.order === order
        ? {
          ...filter,
          [key]: value,
        }
        : filter
    )));
  };

  const clearFilterSelections = (order: number, scope: 'all' | 'included' | 'excluded') => {
    setFilters((prevFilters) => prevFilters.map((filter) => {
      if (filter.order !== order) return filter;

      if (scope === 'included') {
        return {
          ...filter,
          includedValues: [],
        };
      }

      if (scope === 'excluded') {
        return {
          ...filter,
          excludedValues: [],
        };
      }

      return {
        ...filter,
        includedValues: [],
        excludedValues: [],
      };
    }));
  };

  // Sincronizar filtros del contexto cuando cambian los filtros locales
  useEffect(() => {
    const variantsFilterObj = filters.find(f => f.property === 'variant');
    const pokedexRegionFilterObj = filters.find(f => f.property === 'pokedexRegion');

    if (variantsFilterObj) {
      setVariantsFilter(toLegacyChecked(variantsFilterObj.includedValues));
    }
    if (pokedexRegionFilterObj) {
      setPokemonGrouping(prev => ({
        ...prev,
        regionsFilter: toLegacyChecked(pokedexRegionFilterObj.includedValues)
      }));
    }
  }, [filters, setVariantsFilter, setPokemonGrouping]);

  const handleResetFilters = () => {
    setFilters((prevFilters) =>
      prevFilters.map((filter) => ({
        ...filter,
        includedValues: [],
        excludedValues: [],
      }))
    );
    setVariantsFilter(["All"]);
    setPokemonGrouping({
      enabled: false,
      filterByCollection: 'all',
      groupingRegions: ["All"],
      allowVariants: ['Default'],
      hideVariants: [],
      groupSortBy: 'default',
      fallbackToDefault: false
    });
    setPriceRange({ min: null, max: null });
    setCollectionFilter({
      enabled: false,
      mode: 'none',
      selectedCollections: [],
      limit: 1,
      conditionsFilter: ["All"]
    });
    setSortConfig({
      field: 'number',
      direction: 'asc'
    });
    setViewOptions(prev => ({
      ...prev,
      displayMode: 'cardsUngrouped',
    }));

    // Clear all URL parameters
    updateUrlParams({
      series: undefined,
      set: undefined,
      rarity: undefined,
      tags: undefined,
      type: undefined,
      energy: undefined,
      pokedexRegion: undefined,
      pokedexCompletion: undefined,
      variants: undefined,
      cardVariantTopLevel: undefined,
      subtypes: undefined,
      artist: undefined,
      collections: undefined,
      search: undefined,
      order: undefined,
      showTable: undefined,
      showListTable: undefined,
      groupByPokedex: undefined,
      includeWithoutCards: undefined,
      groupingRegions: undefined,
      filterByCollections: undefined,
      viewCollectionOption: undefined,
      priceMin: undefined,
      priceMax: undefined
    });
  };

  return (
    <div className="section-sidebar">
      <CollapsibleGroup>
        <div className="filters-actions">
          <button onClick={handleResetFilters} className="filters-reset-btn" type="button">
            Clear filters
          </button>
          <CollapseAllButton className="filters-collapse-all" />
        </div>
      {filters.map((filter) => {
        const selectedMode = globalSelectionModes[filter.order] || 'include';
        const searchQuery = (optionSearchByFilter[filter.order] || '').toLowerCase().trim();
        const isSearchVisible = searchVisibleByFilter[filter.order] || false;
        const effectiveSearchQuery = isSearchVisible ? searchQuery : '';
        const selectedCount = filter.includedValues.length + filter.excludedValues.length;

        const optionValues = filter.property === 'setSeries' && viewMode.kind === 'collection'
          ? [...filter.options, ...filter.includedValues, ...filter.excludedValues]
          : [
            ...filter.options,
            ...Object.keys(globalOptionCountsByFilter[filter.order] || {}),
            ...filter.includedValues,
            ...filter.excludedValues
          ];
        const visibleOptions = sortByDefaultOrder(
          Array.from(new Set(optionValues)),
          filter.defaultOrder
        );

        const searchableOptions = effectiveSearchQuery.length > 0
          ? visibleOptions.filter((option) => option.toLowerCase().includes(effectiveSearchQuery))
          : visibleOptions;

        const isZeroOption = (option: string) => {
          if (filter.property === 'setSeries') return false;
          const count = contextualOptionCountsByFilter[filter.order]?.[option] ?? 0;
          const currentState: OptionState = filter.includedValues.includes(option)
            ? 'included'
            : filter.excludedValues.includes(option)
              ? 'excluded'
              : 'neutral';
          return count === 0 && currentState === 'neutral';
        };

        const primaryOptions = filter.hideZeroCount
          ? searchableOptions.filter((option) => !isZeroOption(option))
          : searchableOptions;
        const zeroOptions = filter.hideZeroCount
          ? searchableOptions.filter(isZeroOption)
          : [];

        const allOptionsSelectedForMode = searchableOptions.length > 0 && (
          selectedMode === 'include'
            ? searchableOptions.every(opt => filter.includedValues.includes(opt))
            : searchableOptions.every(opt => filter.excludedValues.includes(opt))
        );

        const renderFilterOption = (option: string) => {
          const globalCount = globalOptionCountsByFilter[filter.order]?.[option] ?? 0;
          const visibleCount = contextualOptionCountsByFilter[filter.order]?.[option] ?? 0;
          const currentState: OptionState = filter.includedValues.includes(option)
            ? 'included'
            : filter.excludedValues.includes(option)
              ? 'excluded'
              : 'neutral';
          const isDisabled = filter.property !== 'setSeries' && visibleCount === 0 && currentState === 'neutral';
          const isChecked = selectedMode === 'include'
            ? currentState === 'included'
            : currentState === 'excluded';

          return (
            <label
              key={option}
              className={`filter-option-item ${isDisabled ? 'disabled' : ''} ${currentState}`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => handleQuickToggle(filter.order, option, currentState)}
                aria-label={`Toggle ${option} in ${selectedMode} mode`}
              />
              <span className="filter-option-item-label">{option}</span>
              <span className="filter-option-item-count" title="visible / total">({visibleCount}/{globalCount})</span>
            </label>
          );
        };

        return (
          <CollapsibleSection
            key={filter.order}
            title={`${normalizeLabel(filter.label)} ${selectedCount > 0 ? `(${selectedCount})` : ''}`}
            defaultCollapsed={filter.property !== 'setSeries'}
            collapsedSummary={
              selectedCount > 0
                ? (
                  <div className="filter-collapsed-summary">
                    {filter.includedValues.length > 0 && renderCollapsedChips(
                      filter.includedValues,
                      'include',
                      (value) => handleOptionStateChange(filter.order, value, 'neutral')
                    )}
                    {filter.excludedValues.length > 0 && renderCollapsedChips(
                      filter.excludedValues,
                      'exclude',
                      (value) => handleOptionStateChange(filter.order, value, 'neutral')
                    )}
                  </div>
                )
                : undefined
            }
          >
            <div className="filter-panel-body">
              <div className="filter-toolbar">
                <div className="filter-segmented" role="group" aria-label={`Selection mode for ${normalizeLabel(filter.label)}`}>
                  <button
                    type="button"
                    className={selectedMode === 'include' ? 'active' : ''}
                    onClick={() => handleGlobalModeChange(filter.order, 'include')}
                    aria-label="Include mode"
                    title="Include mode"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className={selectedMode === 'exclude' ? 'active' : ''}
                    onClick={() => handleGlobalModeChange(filter.order, 'exclude')}
                    aria-label="Exclude mode"
                    title="Exclude mode"
                  >
                    ✕
                  </button>
                </div>

                <div className="filter-toolbar-actions">
                  <button
                    type="button"
                    className={`filter-icon-btn ${isSearchVisible ? 'active' : ''}`}
                    onClick={() => handleSearchToggle(filter.order)}
                    aria-label="Show or hide search"
                    title="Search"
                  >
                    🔍
                  </button>
                  <button
                    type="button"
                    className={`filter-icon-btn ${allOptionsSelectedForMode ? 'active' : ''}`}
                    onClick={() => handleSelectAll(filter.order, searchableOptions)}
                    aria-label={allOptionsSelectedForMode ? 'Deselect all' : 'Select all'}
                    title={allOptionsSelectedForMode ? 'Deselect all' : 'Select all'}
                    disabled={searchableOptions.length === 0}
                  >
                    ☑
                  </button>
                  <button
                    type="button"
                    className="filter-icon-btn danger"
                    onClick={() => clearFilterSelections(filter.order, 'all')}
                    aria-label="Clear all"
                    title="Clear all"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {(filter.includedValues.length > 0 || filter.excludedValues.length > 0) && (
                <div className="filter-chip-groups">
                  {filter.includedValues.map((value) => (
                    <button
                      key={`in-${value}`}
                      type="button"
                      className="filter-chip include"
                      onClick={() => handleOptionStateChange(filter.order, value, 'neutral')}
                      aria-label={`Remove included value ${value}`}
                    >
                      {value} <span>×</span>
                    </button>
                  ))}
                  {filter.excludedValues.map((value) => (
                    <button
                      key={`ex-${value}`}
                      type="button"
                      className="filter-chip exclude"
                      onClick={() => handleOptionStateChange(filter.order, value, 'neutral')}
                      aria-label={`Remove excluded value ${value}`}
                    >
                      {value} <span>×</span>
                    </button>
                  ))}
                </div>
              )}

              {isSearchVisible && (
                <input
                  className="filter-search-input"
                  type="text"
                  value={optionSearchByFilter[filter.order] || ''}
                  onChange={(event) => handleSearchChange(filter.order, event.target.value)}
                  placeholder="Search options..."
                  aria-label={`Search ${normalizeLabel(filter.label)}`}
                />
              )}

              <div className="filter-options-list">
                {searchableOptions.length === 0 && <span className="filter-empty">No options</span>}
                {primaryOptions.map(renderFilterOption)}
                {zeroOptions.length > 0 && (
                  <details className="filter-zero-options">
                    <summary>Show more ({zeroOptions.length})</summary>
                    {zeroOptions.map(renderFilterOption)}
                  </details>
                )}
              </div>

              <details className="filter-advanced-panel">
                <summary>Advanced settings</summary>
                <div className="filter-advanced-row">
                  <label className="filter-compact-select">
                    Zero counts
                    <select
                      value={filter.hideZeroCount ? 'hide' : 'disable'}
                      onChange={(event) => handleFilterConfigChange(filter.order, 'hideZeroCount', event.target.value === 'hide')}
                      aria-label={`Zero-count behavior for ${filter.label}`}
                    >
                      <option value="disable">Disable</option>
                      <option value="hide">Show more</option>
                    </select>
                  </label>

                  <label className="filter-compact-select">
                    Include
                    <select
                      value={filter.includeMode}
                      onChange={(event) => handleFilterConfigChange(filter.order, 'includeMode', event.target.value as FilterOption['includeMode'])}
                      aria-label={`Include mode for ${filter.label}`}
                    >
                      <option value="ANY">Any</option>
                      <option value="ALL">All</option>
                      <option value="EXACT_SET">Exact set</option>
                    </select>
                  </label>

                  <label className="filter-compact-select">
                    Exclude
                    <select
                      value={filter.excludeMode}
                      onChange={(event) => handleFilterConfigChange(filter.order, 'excludeMode', event.target.value as FilterOption['excludeMode'])}
                      aria-label={`Exclude mode for ${filter.label}`}
                    >
                      <option value="NOT_ANY">Any</option>
                      <option value="NOT_ALL">All</option>
                      <option value="NOT_EXACT_SET">Exact set</option>
                    </select>
                  </label>

                  {filter.isMultiValue && filter.includedValues.length === 1 && (
                    <label className="filter-compact-select">
                      Match
                      <select
                        value={filter.singleIncludeMatch}
                        onChange={(event) => handleFilterConfigChange(filter.order, 'singleIncludeMatch', event.target.value as FilterOption['singleIncludeMatch'])}
                        aria-label={`Single-value match for ${filter.label}`}
                      >
                        <option value="CONTAINS">Contains</option>
                        <option value="EXACT_SINGLE">Exact</option>
                      </select>
                    </label>
                  )}

                  <div className="filter-clear-actions compact">
                    <button type="button" onClick={() => clearFilterSelections(filter.order, 'included')}>Clear included</button>
                    <button type="button" onClick={() => clearFilterSelections(filter.order, 'excluded')}>Clear excluded</button>
                  </div>
                </div>
              </details>
            </div>
          </CollapsibleSection>
        );
      })}
      </CollapsibleGroup>
    </div>
  );
};
