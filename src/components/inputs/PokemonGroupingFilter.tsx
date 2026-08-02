import { useEffect, useMemo, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";
import { POKEMON_FORM_VARIANTS_ORDER } from "../../constants/constants";

const GROUPING_REGIONS = [
  "All",
  "Kanto",
  "Johto",
  "Hoenn",
  "Sinnoh",
  "Unova",
  "Kalos",
  "Alola",
  "Galar",
  "Hisui",
  "Paldea"
];

export const PokemonGroupingFilter = () => {
  const { pokemonGrouping, setPokemonGrouping, pokemonFormsData } = useCardContext();
  const isFirstRenderRef = useRef(true);

  // Extract variant names from pokemon forms data (only relevant for forms mode)
  const availableVariants = useMemo(() => {
    const variantCounts = new Map<string, number>();
    pokemonFormsData.forEach(form => {
      form.variants.forEach(v => {
        const variantName = v.pokemonVariant.name;
        variantCounts.set(variantName, (variantCounts.get(variantName) || 0) + 1);
      });
    });

    const sorted = Array.from(variantCounts.entries())
      .sort((a, b) => {
        const ai = POKEMON_FORM_VARIANTS_ORDER.indexOf(a[0]);
        const bi = POKEMON_FORM_VARIANTS_ORDER.indexOf(b[0]);
        const aIdx = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
        const bIdx = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
        if (aIdx !== bIdx) return aIdx - bIdx;
        if (aIdx === Number.MAX_SAFE_INTEGER) return b[1] - a[1] || a[0].localeCompare(b[0]);
        return 0;
      })
      .map(([variantName]) => variantName);

    return ['Default', ...sorted];
  }, [pokemonFormsData]);

  // Initialize from URL on mount (backward compatible with old params)
  useEffect(() => {
    const params = parseUrlParams();

    setPokemonGrouping(prev => {
      const updated = { ...prev };

      // Backward compat: old groupByPokedex or groupByForms param
      if (params.groupByPokedex === 'true' || params.groupByForms === 'true') {
        updated.enabled = true;
      }

      // New unified params
      if (params.pokemonGroupingEnabled === 'true') {
        updated.enabled = true;
      }

      // Shared params
      if (params.filterByCollection) {
        updated.filterByCollection = params.filterByCollection as 'all' | 'owned' | 'notOwned' | 'ownedNone';
      } else if (params.formsFilterByCollection) {
        updated.filterByCollection = params.formsFilterByCollection as 'all' | 'owned' | 'notOwned' | 'ownedNone';
      }

      // Grouping regions (try new param, then old pokedex, then old forms)
      if (params.groupingRegions && params.groupingRegions.length > 0) {
        updated.groupingRegions = params.groupingRegions;
      } else if (params.formsGroupingRegions && params.formsGroupingRegions.length > 0) {
        updated.groupingRegions = params.formsGroupingRegions;
      }

      // Legacy pokedex filter by collection
      const hideNotOwnPokedex = params.hideNotOwnPokedex === 'true';
      const hideObtainedPokedex = params.hideObtainedPokedex === 'true';
      if (hideObtainedPokedex && updated.filterByCollection === 'all') {
        updated.filterByCollection = 'notOwned';
      } else if (hideNotOwnPokedex && updated.filterByCollection === 'all') {
        updated.filterByCollection = 'owned';
      }

      // Forms-specific
      if (params.formsAllowVariants && params.formsAllowVariants.length > 0) {
        updated.allowVariants = params.formsAllowVariants;
      } else if (params.formsEnabledVariants && params.formsEnabledVariants.length > 0) {
        updated.allowVariants = params.formsEnabledVariants;
      }
      if (params.formsHideVariants && params.formsHideVariants.length > 0) {
        updated.hideVariants = params.formsHideVariants;
      }
      if (params.formsGroupSortBy) {
        updated.groupSortBy = params.formsGroupSortBy as 'default' | 'cardCount' | 'cardCountDesc';
      }

      if (params.formsFallbackToDefault === 'true') {
        updated.fallbackToDefault = true;
      }

      return updated;
    });

    isFirstRenderRef.current = false;
  }, []); // Only run on mount

  // Sync URL when filter changes
  useEffect(() => {
    if (!isFirstRenderRef.current) {
      updateUrlParams({
        pokemonGroupingEnabled: pokemonGrouping.enabled ? 'true' : 'false',
        filterByCollection: pokemonGrouping.filterByCollection,
        groupingRegions: pokemonGrouping.groupingRegions,
        formsAllowVariants: pokemonGrouping.allowVariants,
        formsHideVariants: pokemonGrouping.hideVariants,
        formsGroupSortBy: pokemonGrouping.groupSortBy,
        formsFallbackToDefault: pokemonGrouping.fallbackToDefault ? 'true' : 'false',
        // Clear old params
        pokemonGroupingMode: undefined,
        groupByPokedex: undefined,
        groupByForms: undefined,
        includeWithoutCards: undefined,
        formsFilterByCollection: undefined,
        formsGroupingRegions: undefined,
        formsEnabledVariants: undefined,
      });
    }
  }, [pokemonGrouping]);

  const handleGroupingRegionChange = (region: string): void => {
    setPokemonGrouping(prev => {
      let newRegions: string[];

      if (region === "All") {
        newRegions = ["All"];
      } else {
        const currentRegions = prev.groupingRegions.filter(r => r !== "All");
        if (currentRegions.includes(region)) {
          newRegions = currentRegions.filter(r => r !== region);
          if (newRegions.length === 0) {
            newRegions = ["All"];
          }
        } else {
          newRegions = [...currentRegions, region];
        }
      }

      return { ...prev, groupingRegions: newRegions };
    });
  };

  const handleVariantToggle = (variantName: string, mode: 'allow' | 'hide'): void => {
    setPokemonGrouping(prev => {
      const currentVariants = mode === 'allow' ? prev.allowVariants : prev.hideVariants;
      const key = mode === 'allow' ? 'allowVariants' : 'hideVariants';

      if (currentVariants.includes(variantName)) {
        return { ...prev, [key]: currentVariants.filter(v => v !== variantName) };
      } else {
        return { ...prev, [key]: [...currentVariants, variantName] };
      }
    });
  };

  return (
    <div className="section-sidebar">
      <CollapsibleFieldset legend="Agrupar por Pokémon" defaultCollapsed={true}>
        <label>
          <input
            type="checkbox"
            checked={pokemonGrouping.enabled}
            onChange={() => {
              setPokemonGrouping(prev => ({
                ...prev,
                enabled: !prev.enabled
              }));
            }}
            aria-label="Agrupar por Pokémon"
          />
          Agrupar por Pokémon
        </label>

        {pokemonGrouping.enabled && (
          <>
            <label>
              <input
                type="checkbox"
                checked={pokemonGrouping.fallbackToDefault}
                onChange={() => {
                  setPokemonGrouping(prev => ({
                    ...prev,
                    fallbackToDefault: !prev.fallbackToDefault
                  }));
                }}
                aria-label="Agrupar formas no listadas en la forma default"
              />
              Agrupar formas no listadas en default
            </label>

            <div className="pokedex-filter-group">
              <label htmlFor="pokemonGroupFilterSelect">
                Mostrar grupos:
              </label>
              <select
                id="pokemonGroupFilterSelect"
                value={pokemonGrouping.filterByCollection}
                onChange={(e) => {
                  setPokemonGrouping(prev => ({
                    ...prev,
                    filterByCollection: e.target.value as 'all' | 'owned' | 'notOwned' | 'ownedNone'
                  }));
                }}
                className="pokedex-filter-select"
              >
                <option value="all">Todos los Pokémon</option>
                <option value="owned">Solo con al menos una carta</option>
                <option value="notOwned">Solo sin ninguna carta</option>
                <option value="ownedNone">Solo grupos sin cartas propias</option>
              </select>
            </div>

            <div className="pokedex-filter-group">
              <label htmlFor="formsGroupSortSelect">
                Ordenar grupos:
              </label>
              <select
                id="formsGroupSortSelect"
                value={pokemonGrouping.groupSortBy}
                onChange={(e) => {
                  setPokemonGrouping(prev => ({
                    ...prev,
                    groupSortBy: e.target.value as 'default' | 'cardCount' | 'cardCountDesc' | 'ownedCount' | 'ownedCountDesc'
                  }));
                }}
                className="pokedex-filter-select"
              >
                <option value="default">Orden por defecto</option>
                <option value="cardCount">Menos cartas primero</option>
                <option value="cardCountDesc">Más cartas primero</option>
                <option value="ownedCount">Menos propias primero</option>
                <option value="ownedCountDesc">Más propias primero</option>
              </select>
            </div>

            <div className="pokedex-filter-group">
              <p className="pokedex-filter-label">Variantes a mostrar:</p>
              <div className="forms-variant-legend">
                <span className="forms-variant-legend-name">Variante</span>
                <span className="forms-variant-legend-toggle">Allow</span>
                <span className="forms-variant-legend-toggle">Hide</span>
              </div>
              {availableVariants.map((variant) => (
                <div key={variant} className="forms-variant-option">
                  <span className="pokedex-region-label">{variant}</span>
                  <input
                    type="checkbox"
                    value={variant}
                    checked={pokemonGrouping.allowVariants.includes(variant)}
                    onChange={() => handleVariantToggle(variant, 'allow')}
                    aria-label={`Allow variante ${variant}`}
                  />
                  <input
                    type="checkbox"
                    value={variant}
                    checked={pokemonGrouping.hideVariants.includes(variant)}
                    onChange={() => handleVariantToggle(variant, 'hide')}
                    aria-label={`Hide variante ${variant}`}
                  />
                </div>
              ))}
            </div>

            <div className="pokedex-filter-group">
              <p className="pokedex-filter-label">Regiones para agrupar:</p>
              {GROUPING_REGIONS.map((region) => (
                <label key={region} className="pokedex-region-option">
                  <input
                    type="checkbox"
                    value={region}
                    checked={pokemonGrouping.groupingRegions.includes(region)}
                    onChange={() => handleGroupingRegionChange(region)}
                    aria-label={`Incluir región ${region} en agrupación`}
                  />
                  <span className="pokedex-region-label">{region}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </CollapsibleFieldset>
    </div>
  );
};
