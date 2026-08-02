import { useEffect, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";

const POKEDEX_REGIONS = [
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

export const PokedexFilter = () => {
  const { pokemonGrouping, setPokemonGrouping } = useCardContext();
  const isFirstRenderRef = useRef(true);

  // Initialize from URL on mount (keeps compatibility with legacy params)
  useEffect(() => {
    const params = parseUrlParams();

    setPokemonGrouping((prev) => {
      const updated = { ...prev };

      // Legacy + unified enabled params
      if (params.groupByPokedex === "true" || params.pokemonGroupingEnabled === "true") {
        updated.enabled = true;
      }

      // New shared param has priority
      if (params.filterByCollection) {
        updated.filterByCollection = params.filterByCollection as 'all' | 'owned' | 'notOwned' | 'ownedNone';
      } else {
        // Legacy mapping
        const hideNotOwnPokedex = params.hideNotOwnPokedex === "true";
        const hideObtainedPokedex = params.hideObtainedPokedex === "true";

        if (hideObtainedPokedex && updated.filterByCollection === "all") {
          updated.filterByCollection = "notOwned";
        } else if (hideNotOwnPokedex && updated.filterByCollection === "all") {
          updated.filterByCollection = "owned";
        }
      }

      // Accept both groupingRegions and old pokedexRegions param names
      if (params.groupingRegions && params.groupingRegions.length > 0) {
        updated.groupingRegions = params.groupingRegions;
      } else if (params.pokedexRegions && params.pokedexRegions.length > 0) {
        updated.groupingRegions = params.pokedexRegions;
      }

      return updated;
    });

    isFirstRenderRef.current = false;
  }, [setPokemonGrouping]);

  // Sync URL when the current grouping state changes
  useEffect(() => {
    if (!isFirstRenderRef.current) {
      updateUrlParams({
        groupByPokedex: pokemonGrouping.enabled ? "true" : "false",
        pokemonGroupingEnabled: pokemonGrouping.enabled ? "true" : "false",
        filterByCollection: pokemonGrouping.filterByCollection,
        groupingRegions: pokemonGrouping.groupingRegions,
        hideNotOwnPokedex: undefined,
        hideObtainedPokedex: undefined
      });
    }
  }, [pokemonGrouping]);

  const handleGroupingRegionChange = (region: string): void => {
    setPokemonGrouping((prev) => {
      let newRegions: string[];

      if (region === "All") {
        newRegions = ["All"];
      } else {
        const currentRegions = prev.groupingRegions.filter((r) => r !== "All");
        if (currentRegions.includes(region)) {
          newRegions = currentRegions.filter((r) => r !== region);
          if (newRegions.length === 0) {
            newRegions = ["All"];
          }
        } else {
          newRegions = [...currentRegions, region];
        }
      }

      return {
        ...prev,
        groupingRegions: newRegions
      };
    });
  };

  return (
    <div className="section-sidebar">
      <CollapsibleFieldset legend="Opciones de Pokedex" defaultCollapsed={true}>
        <label>
          <input
            type="checkbox"
            checked={pokemonGrouping.enabled}
            onChange={() => {
              setPokemonGrouping((prev) => ({
                ...prev,
                enabled: !prev.enabled
              }));
            }}
            aria-label="Agrupar por Pokedex"
          />
          Agrupar por Pokedex
        </label>

        {pokemonGrouping.enabled && (
          <>
            <div className="pokedex-filter-group">
              <label htmlFor="pokedexGroupFilterSelect">
                Mostrar grupos:
              </label>
              <select
                id="pokedexGroupFilterSelect"
                value={pokemonGrouping.filterByCollection}
                onChange={(e) => {
                  setPokemonGrouping((prev) => ({
                    ...prev,
                    filterByCollection: e.target.value as 'all' | 'owned' | 'notOwned' | 'ownedNone'
                  }));
                }}
                className="pokedex-filter-select"
              >
                <option value="all">Todos los Pokemon</option>
                <option value="owned">Solo con al menos una carta</option>
                <option value="notOwned">Solo sin ninguna carta</option>
                <option value="ownedNone">Solo grupos sin cartas propias</option>
              </select>
            </div>

            <div className="pokedex-filter-group">
              <p className="pokedex-filter-label">Regiones para agrupar:</p>
              {POKEDEX_REGIONS.map((region) => (
                <label key={region} className="pokedex-region-option">
                  <input
                    type="checkbox"
                    value={region}
                    checked={pokemonGrouping.groupingRegions.includes(region)}
                    onChange={() => handleGroupingRegionChange(region)}
                    aria-label={`Incluir region ${region} en agrupacion`}
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
