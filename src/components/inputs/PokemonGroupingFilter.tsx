import { useEffect, useMemo } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { updateUrlParams } from "../../utils/urlParams";
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

  // The initial values, including the legacy parameters, are restored in CardContext.
  // This writes the current shape back and drops the parameters it replaced.
  useEffect(() => {
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
      <CollapsibleSection title="Group by Pokémon" defaultCollapsed={true}>
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
            aria-label="Group by Pokémon"
          />
          Group by Pokémon
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
                aria-label="Group unlisted forms under the default form"
              />
              Group unlisted forms under default
            </label>

            <div className="pokedex-filter-group">
              <label htmlFor="pokemonGroupFilterSelect">
                Show groups:
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
                <option value="all">All Pokémon</option>
                <option value="owned">With at least one card</option>
                <option value="notOwned">Without any cards</option>
                <option value="ownedNone">Groups with no owned cards</option>
              </select>
            </div>

            <div className="pokedex-filter-group">
              <label htmlFor="formsGroupSortSelect">
                Sort groups:
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
                <option value="default">Default order</option>
                <option value="cardCount">Fewest cards first</option>
                <option value="cardCountDesc">Most cards first</option>
                <option value="ownedCount">Fewest owned first</option>
                <option value="ownedCountDesc">Most owned first</option>
              </select>
            </div>

            <div className="pokedex-filter-group">
              <p className="pokedex-filter-label">Variants to display:</p>
              <div className="forms-variant-legend">
                <span className="forms-variant-legend-name">Variant</span>
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
                    aria-label={`Allow variant ${variant}`}
                  />
                  <input
                    type="checkbox"
                    value={variant}
                    checked={pokemonGrouping.hideVariants.includes(variant)}
                    onChange={() => handleVariantToggle(variant, 'hide')}
                    aria-label={`Hide variant ${variant}`}
                  />
                </div>
              ))}
            </div>

            <div className="pokedex-filter-group">
              <p className="pokedex-filter-label">Regions to group:</p>
              {GROUPING_REGIONS.map((region) => (
                <label key={region} className="pokedex-region-option">
                  <input
                    type="checkbox"
                    value={region}
                    checked={pokemonGrouping.groupingRegions.includes(region)}
                    onChange={() => handleGroupingRegionChange(region)}
                    aria-label={`Include region ${region} in grouping`}
                  />
                  <span className="pokedex-region-label">{region}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </CollapsibleSection>
    </div>
  );
};
