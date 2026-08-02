import { useEffect, useMemo, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";
import { POKEMON_FORM_VARIANTS_ORDER } from "../../constants/constants";

const FORMS_REGIONS = [
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

export const PokemonFormsFilter = () => {
  const { pokemonGrouping: formsFilter, setPokemonGrouping: setFormsFilter, pokemonFormsData } = useCardContext();
  const isFirstRenderRef = useRef(true);

  // Extract variant names from pokemon forms data sorted by frequency (desc)
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
        // Unknown variants at the end, sorted by frequency desc then alpha
        if (aIdx === Number.MAX_SAFE_INTEGER) return b[1] - a[1] || a[0].localeCompare(b[0]);
        return 0;
      })
      .map(([variantName]) => variantName);

    return ['Default', ...sorted];
  }, [pokemonFormsData]);

  // Initialize from URL on mount
  useEffect(() => {
    const params = parseUrlParams();

    setFormsFilter((prev: typeof formsFilter) => ({
      ...prev,
      enabled: params.groupByForms === 'true' ? true : prev.enabled,
      filterByCollection: params.formsFilterByCollection
        ? (params.formsFilterByCollection as 'all' | 'owned' | 'notOwned' | 'ownedNone')
        : prev.filterByCollection,
      groupingRegions: params.formsGroupingRegions && params.formsGroupingRegions.length > 0
        ? params.formsGroupingRegions
        : prev.groupingRegions,
      allowVariants: params.formsAllowVariants && params.formsAllowVariants.length > 0
        ? params.formsAllowVariants
        : (params.formsEnabledVariants && params.formsEnabledVariants.length > 0
          ? params.formsEnabledVariants
          : prev.allowVariants),
      hideVariants: params.formsHideVariants && params.formsHideVariants.length > 0
        ? params.formsHideVariants
        : prev.hideVariants,
      groupSortBy: params.formsGroupSortBy
        ? (params.formsGroupSortBy as 'default' | 'cardCount' | 'cardCountDesc')
        : prev.groupSortBy
    }));

    isFirstRenderRef.current = false;
  }, []); // Only run on mount

  // Sync URL when filter changes
  useEffect(() => {
    if (!isFirstRenderRef.current) {
      updateUrlParams({
        groupByForms: formsFilter.enabled ? 'true' : 'false',
        formsFilterByCollection: formsFilter.filterByCollection,
        formsGroupingRegions: formsFilter.groupingRegions,
        formsAllowVariants: formsFilter.allowVariants,
        formsHideVariants: formsFilter.hideVariants,
        formsEnabledVariants: undefined,
        formsGroupSortBy: formsFilter.groupSortBy
      });
    }
  }, [formsFilter]);

  const handleGroupingRegionChange = (region: string): void => {
    setFormsFilter((prev: typeof formsFilter) => {
      let newRegions: string[];

      if (region === "All") {
        newRegions = ["All"];
      } else {
        const currentRegions = prev.groupingRegions.filter((r: string) => r !== "All");
        if (currentRegions.includes(region)) {
          newRegions = currentRegions.filter((r: string) => r !== region);
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
    setFormsFilter((prev: typeof formsFilter) => {
      const currentVariants = mode === 'allow' ? prev.allowVariants : prev.hideVariants;
      const key = mode === 'allow' ? 'allowVariants' : 'hideVariants';

      if (currentVariants.includes(variantName)) {
        return { ...prev, [key]: currentVariants.filter((v: string) => v !== variantName) };
      } else {
        return { ...prev, [key]: [...currentVariants, variantName] };
      }
    });
  };

  return (
    <div className="section-sidebar">
      <CollapsibleFieldset legend="Opciones de Pokémon Forms" defaultCollapsed={true}>
        <label>
          <input
            type="checkbox"
            checked={formsFilter.enabled}
            onChange={() => {
              setFormsFilter((prev: typeof formsFilter) => ({
                ...prev,
                enabled: !prev.enabled
              }));
            }}
            aria-label="Agrupar por Pokémon Forms"
          />
          Agrupar por Pokémon Forms
        </label>

        {formsFilter.enabled && (
          <>
            <div className="pokedex-filter-group">
              <label htmlFor="formsGroupFilterSelect">
                Mostrar grupos:
              </label>
              <select
                id="formsGroupFilterSelect"
                value={formsFilter.filterByCollection}
                onChange={(e) => {
                  setFormsFilter((prev: typeof formsFilter) => ({
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
                value={formsFilter.groupSortBy}
                onChange={(e) => {
                  setFormsFilter((prev: typeof formsFilter) => ({
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
                    checked={formsFilter.allowVariants.includes(variant)}
                    onChange={() => handleVariantToggle(variant, 'allow')}
                    aria-label={`Allow variante ${variant}`}
                  />
                  <input
                    type="checkbox"
                    value={variant}
                    checked={formsFilter.hideVariants.includes(variant)}
                    onChange={() => handleVariantToggle(variant, 'hide')}
                    aria-label={`Hide variante ${variant}`}
                  />
                </div>
              ))}
            </div>

            <div className="pokedex-filter-group">
              <p className="pokedex-filter-label">Regiones para agrupar:</p>
              {FORMS_REGIONS.map((region) => (
                <label key={region} className="pokedex-region-option">
                  <input
                    type="checkbox"
                    value={region}
                    checked={formsFilter.groupingRegions.includes(region)}
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
