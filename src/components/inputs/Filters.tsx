import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterOption, Card } from "../../types/dashboard";
import type { HierarchySerie } from "../../types/source-card";
import { useCardContext } from "../../context/CardContext";
import { filterCardsByProperty, filterCardsByPokedexCompletion, excludeCardsByProperty } from "../../utils/filters";
import { arraysEqual, getUniqueValuesFromProperty, countAllValuesFromProperty } from "../../utils/utils";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { DEFAULT_RARITIES_ORDER, DEFAULT_ENERGY_TYPES_ORDER, POKEDEX_REGIONS, DEFAULT_POKEDEX_REGIONS_ORDER, DEFAULT_VARIANTS_ORDER } from "../../constants/constants";
import { updateUrlParams, initializeFiltersFromUrl } from "../../utils/urlParams";
import { loadHierarchy } from "../../services/cards";

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
      <span className="filter-collapsed-group-title">{type === 'include' ? 'Incluye' : 'Excluye'}</span>
      {visibleValues.map((value) => (
        <button
          key={`${type}-${value}`}
          type="button"
          className={`filter-collapsed-chip filter-collapsed-chip-button ${type}`}
          onClick={() => onRemoveValue(value)}
          aria-label={`Quitar ${type === 'include' ? 'incluido' : 'excluido'} ${value}`}
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
    setSeriesSelection
  } = useCardContext();

  // Track if this is the first render to avoid overwriting URL params on initial load
  const isInitialRender = useRef(true);
  const hierarchyRef = useRef<HierarchySerie[]>([]);

  // Load hierarchy: set series order and store full hierarchy for set ordering
  useEffect(() => {
    loadHierarchy().then((hierarchy) => {
      hierarchyRef.current = hierarchy;
      const sortedHierarchy = [...hierarchy].sort((a, b) => a.order - b.order);
      const orderedSeriesNames = sortedHierarchy.map((s) => s.name);
      // Build global ordered set names across all series
      const allOrderedSetNames = sortedHierarchy.flatMap((s) =>
        [...s.sets].sort((a, b) => a.order - b.order).map((set) => set.name)
      );
      setFilters((prev) =>
        prev.map((f) => {
          if (f.property === 'setSeries') {
            return { ...f, options: orderedSeriesNames, defaultOrder: orderedSeriesNames };
          }
          if (f.property === 'setNames') return { ...f, defaultOrder: allOrderedSetNames };
          return f;
        })
      );
    });
  }, []);

  const [globalSelectionModes, setGlobalSelectionModes] = useState<Record<number, SelectionMode>>({});
  const [optionSearchByFilter, setOptionSearchByFilter] = useState<Record<number, string>>({});
  const [searchVisibleByFilter, setSearchVisibleByFilter] = useState<Record<number, boolean>>({})

  // Inicializar filtros desde URL usando una función de inicialización
  const [filters, setFilters] = useState<FilterOption[]>(() => {
    const urlFilters = initializeFiltersFromUrl();

    const buildFilter = (
      order: number,
      label: string,
      property: FilterOption['property'],
      includedValues: string[],
      isMultiValue: boolean,
      options: string[] = [],
      defaultOrder?: string[]
    ): FilterOption => ({
      order,
      label,
      property,
      options,
      includedValues,
      excludedValues: [],
      includeMode: 'ANY',
      excludeMode: 'NOT_ANY',
      singleIncludeMatch: 'CONTAINS',
      isMultiValue,
      hideZeroCount: false,
      defaultOrder,
    });

    return [
      buildFilter(1, "Serie:", "setSeries", normalizeFromUrl(urlFilters.series), false),
      buildFilter(2, "Set:", "setNames", normalizeFromUrl(urlFilters.set), true),
      buildFilter(
        3,
        "Variant TopLevel:",
        "cardVariantTopLevel",
        normalizeFromUrl(urlFilters.cardVariantTopLevel),
        false,
        [],
        DEFAULT_VARIANTS_ORDER
      ),
      buildFilter(
        4,
        "Variants:",
        "variant",
        normalizeFromUrl(urlFilters.variants),
        false,
        [],
        DEFAULT_VARIANTS_ORDER
      ),
      buildFilter(5, "Rarity:", "rarities", normalizeFromUrl(urlFilters.rarity), true, [], DEFAULT_RARITIES_ORDER),
      buildFilter(
        6,
        "Region:",
        "pokedexRegion",
        normalizeFromUrl(urlFilters.pokedexRegion),
        false,
        POKEDEX_REGIONS.map((region) => region.name),
        DEFAULT_POKEDEX_REGIONS_ORDER
      ),
      buildFilter(7, "Type:", "cardType", normalizeFromUrl(urlFilters.type), false),
      buildFilter(8, "Energie:", "types", normalizeFromUrl(urlFilters.energy), true, [], DEFAULT_ENERGY_TYPES_ORDER),
      buildFilter(9, "Subtypes:", "subtypes", normalizeFromUrl(urlFilters.subtypes), true),
      buildFilter(10, "Artist:", "artist", normalizeFromUrl(urlFilters.artist), false)
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
    if (hierarchyRef.current.length === 0) return;

    const sortedHierarchy = [...hierarchyRef.current].sort((a, b) => a.order - b.order);
    const orderedSetNames =
      !selectedSeriesValues || selectedSeriesValues.length === 0
        ? sortedHierarchy.flatMap((s) =>
            [...s.sets].sort((a, b) => a.order - b.order).map((set) => set.name)
          )
        : sortedHierarchy
            .filter((s) => selectedSeriesValues.includes(s.name))
            .flatMap((s) =>
              [...s.sets].sort((a, b) => a.order - b.order).map((set) => set.name)
            );

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
      if (seriesFilterState && seriesFilterState.includedValues.length === 0 && seriesFilterState.excludedValues.length === 0) {
        setFilteredCards([]);
        return;
      }
      setFilteredCards(currentCards);
    }
  }, [allCards, filters, setFilteredCards, updateFilterOptions, variantsFilter]);

  // Sincronizar URL cuando cambian TODOS los filtros
  useEffect(() => {
    // Skip URL update on initial render to preserve URL params like priceMin/priceMax
    if (isInitialRender.current) {
      isInitialRender.current = false;

      return;
    }

    const urlParams: Record<string, string[]> = {};

    filters.forEach((filter) => {
      // Mapear propiedades a nombres de URL
      const paramName =
        filter.property === 'setSeries' ? 'series' :
          filter.property === 'setNames' ? 'set' :
            filter.property === 'rarities' ? 'rarity' :
              filter.property === 'cardType' ? 'type' :
                filter.property === 'types' ? 'energy' :
                  filter.property === 'pokedexRegion' ? 'pokedexRegion' :
                    filter.property === 'pokedexCompletion' ? 'pokedexCompletion' :
                      filter.property === 'variant' ? 'variants' :
                        filter.property === 'cardVariantTopLevel' ? 'cardVariantTopLevel' :
                          filter.property === 'subtypes' ? 'subtypes' :
                            filter.property === 'artist' ? 'artist' :
                        null;

      if (paramName) {
        urlParams[paramName] = toLegacyChecked(filter.includedValues);
      }
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
    setViewOptions({
      displayMode: 'cardsUngrouped'
    });

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
      <button onClick={handleResetFilters} className="filters-reset-btn" type="button">
        Limpiar filtros
      </button>
      {filters.map((filter) => {
        const selectedMode = globalSelectionModes[filter.order] || 'include';
        const searchQuery = (optionSearchByFilter[filter.order] || '').toLowerCase().trim();
        const isSearchVisible = searchVisibleByFilter[filter.order] || false;
        const effectiveSearchQuery = isSearchVisible ? searchQuery : '';
        const selectedCount = filter.includedValues.length + filter.excludedValues.length;

        const visibleOptions = sortByDefaultOrder(
          Array.from(new Set([
            ...filter.options,
            ...Object.keys(globalOptionCountsByFilter[filter.order] || {}),
            ...filter.includedValues,
            ...filter.excludedValues
          ])),
          filter.defaultOrder
        );

        const orderedVisibleOptions = [...visibleOptions].sort((a, b) => {
          const aCount = contextualOptionCountsByFilter[filter.order]?.[a] ?? 0;
          const bCount = contextualOptionCountsByFilter[filter.order]?.[b] ?? 0;
          const aState: OptionState = filter.includedValues.includes(a)
            ? 'included'
            : filter.excludedValues.includes(a)
              ? 'excluded'
              : 'neutral';
          const bState: OptionState = filter.includedValues.includes(b)
            ? 'included'
            : filter.excludedValues.includes(b)
              ? 'excluded'
              : 'neutral';
          const aDisabled = aCount === 0 && aState === 'neutral';
          const bDisabled = bCount === 0 && bState === 'neutral';

          if (aDisabled === bDisabled) return 0;
          return aDisabled ? 1 : -1;
        });

        const searchableOptions = effectiveSearchQuery.length > 0
          ? orderedVisibleOptions.filter((option) => option.toLowerCase().includes(effectiveSearchQuery))
          : orderedVisibleOptions;

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

        const primaryOptions = searchableOptions.filter((option) => !isZeroOption(option));
        const zeroOptions = searchableOptions.filter(isZeroOption);

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
                aria-label={`Alternar ${option} en modo ${selectedMode}`}
              />
              <span className="filter-option-item-label">{option}</span>
              <span className="filter-option-item-count" title="en pantalla / global">({visibleCount}/{globalCount})</span>
            </label>
          );
        };

        return (
          <CollapsibleFieldset
            key={filter.order}
            legend={`${normalizeLabel(filter.label)} ${selectedCount > 0 ? `(${selectedCount})` : ''}`}
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
                <div className="filter-segmented" role="group" aria-label={`Modo global de ${normalizeLabel(filter.label)}`}>
                  <button
                    type="button"
                    className={selectedMode === 'include' ? 'active' : ''}
                    onClick={() => handleGlobalModeChange(filter.order, 'include')}
                    aria-label="Modo incluir"
                    title="Modo incluir"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className={selectedMode === 'exclude' ? 'active' : ''}
                    onClick={() => handleGlobalModeChange(filter.order, 'exclude')}
                    aria-label="Modo excluir"
                    title="Modo excluir"
                  >
                    ✕
                  </button>
                </div>

                <div className="filter-toolbar-actions">
                  <button
                    type="button"
                    className={`filter-icon-btn ${isSearchVisible ? 'active' : ''}`}
                    onClick={() => handleSearchToggle(filter.order)}
                    aria-label="Mostrar u ocultar búsqueda"
                    title="Buscar"
                  >
                    🔍
                  </button>
                  <button
                    type="button"
                    className={`filter-icon-btn ${allOptionsSelectedForMode ? 'active' : ''}`}
                    onClick={() => handleSelectAll(filter.order, searchableOptions)}
                    aria-label={allOptionsSelectedForMode ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    title={allOptionsSelectedForMode ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    disabled={searchableOptions.length === 0}
                  >
                    ☑
                  </button>
                  <button
                    type="button"
                    className="filter-icon-btn danger"
                    onClick={() => clearFilterSelections(filter.order, 'all')}
                    aria-label="Limpiar todo"
                    title="Limpiar todo"
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
                      aria-label={`Quitar incluido ${value}`}
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
                      aria-label={`Quitar excluido ${value}`}
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
                  placeholder="Buscar opciones..."
                  aria-label={`Buscar en ${normalizeLabel(filter.label)}`}
                />
              )}

              <div className="filter-options-list">
                {searchableOptions.length === 0 && <span className="filter-empty">Sin opciones</span>}
                {primaryOptions.map(renderFilterOption)}
                {zeroOptions.length > 0 && (
                  <details className="filter-zero-options">
                    <summary>Ver más ({zeroOptions.length})</summary>
                    {zeroOptions.map(renderFilterOption)}
                  </details>
                )}
              </div>

              <details className="filter-advanced-panel">
                <summary>Ajustes avanzados</summary>
                <div className="filter-advanced-row">
                  <label className="filter-compact-select">
                    Ceros
                    <select
                      value={filter.hideZeroCount ? 'hide' : 'disable'}
                      onChange={(event) => handleFilterConfigChange(filter.order, 'hideZeroCount', event.target.value === 'hide')}
                      aria-label={`Tratamiento de ceros en ${filter.label}`}
                    >
                      <option value="disable">Deshabilitar</option>
                      <option value="hide">Ver mas</option>
                    </select>
                  </label>

                  <label className="filter-compact-select">
                    Incluye
                    <select
                      value={filter.includeMode}
                      onChange={(event) => handleFilterConfigChange(filter.order, 'includeMode', event.target.value as FilterOption['includeMode'])}
                      aria-label={`Modo de inclusión en ${filter.label}`}
                    >
                      <option value="ANY">Cualquiera</option>
                      <option value="ALL">Todos</option>
                      <option value="EXACT_SET">Exactamente esos</option>
                    </select>
                  </label>

                  <label className="filter-compact-select">
                    Excluye
                    <select
                      value={filter.excludeMode}
                      onChange={(event) => handleFilterConfigChange(filter.order, 'excludeMode', event.target.value as FilterOption['excludeMode'])}
                      aria-label={`Modo de exclusión en ${filter.label}`}
                    >
                      <option value="NOT_ANY">Cualquiera</option>
                      <option value="NOT_ALL">Todos</option>
                      <option value="NOT_EXACT_SET">Exacto</option>
                    </select>
                  </label>

                  {filter.isMultiValue && filter.includedValues.length === 1 && (
                    <label className="filter-compact-select">
                      Match
                      <select
                        value={filter.singleIncludeMatch}
                        onChange={(event) => handleFilterConfigChange(filter.order, 'singleIncludeMatch', event.target.value as FilterOption['singleIncludeMatch'])}
                        aria-label={`Coincidencia de único valor en ${filter.label}`}
                      >
                        <option value="CONTAINS">Incluye</option>
                        <option value="EXACT_SINGLE">Exacto</option>
                      </select>
                    </label>
                  )}

                  <div className="filter-clear-actions compact">
                    <button type="button" onClick={() => clearFilterSelections(filter.order, 'included')}>Solo incluye</button>
                    <button type="button" onClick={() => clearFilterSelections(filter.order, 'excluded')}>Solo excluye</button>
                  </div>
                </div>
              </details>
            </div>
          </CollapsibleFieldset>
        );
      })}
    </div>
  );
};
