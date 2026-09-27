import { useCardContext } from "../../context/CardContext";
import { navigate } from "../../utils/route";
import { CollapsibleSection } from "../ui/CollapsibleSection";

export const PokemonGroupingFilter = () => {
  const { pokemonGrouping, setPokemonGrouping } = useCardContext();

  return (
    <div className="section-sidebar">
      <CollapsibleSection title="Group by Pokémon" defaultCollapsed={true}>
        <label>
          <input
            type="checkbox"
            checked={pokemonGrouping.enabled}
            onChange={() => setPokemonGrouping((current) => ({ ...current, enabled: !current.enabled }))}
            aria-label="Group by Pokémon"
          />
          Group by Pokémon
        </label>
        <button type="button" className="pokedex-open-projects" onClick={() => navigate('pokedex')}>
          Open Pokédex projects
        </button>
        {pokemonGrouping.enabled && <>
          <label>
            <input
              type="checkbox"
              checked={pokemonGrouping.fallbackToDefault}
              onChange={() => setPokemonGrouping((current) => ({
                ...current, fallbackToDefault: !current.fallbackToDefault,
              }))}
              aria-label="Group unlisted forms under the default form"
            />
            Group unlisted forms under default
          </label>
          <div className="pokedex-filter-group">
            <label htmlFor="pokemonGroupFilterSelect">Show groups:</label>
            <select
              id="pokemonGroupFilterSelect"
              value={pokemonGrouping.filterByCollection}
              onChange={(event) => setPokemonGrouping((current) => ({
                ...current,
                filterByCollection: event.target.value as typeof current.filterByCollection,
              }))}
              className="pokedex-filter-select"
            >
              <option value="all">All Pokémon</option>
              <option value="owned">With at least one card</option>
              <option value="notOwned">Without any cards</option>
              <option value="ownedNone">Groups with no owned cards</option>
            </select>
          </div>
          <div className="pokedex-filter-group">
            <label htmlFor="formsGroupSortSelect">Sort groups:</label>
            <select
              id="formsGroupSortSelect"
              value={pokemonGrouping.groupSortBy}
              onChange={(event) => setPokemonGrouping((current) => ({
                ...current,
                groupSortBy: event.target.value as typeof current.groupSortBy,
              }))}
              className="pokedex-filter-select"
            >
              <option value="default">Default order</option>
              <option value="cardCount">Fewest cards first</option>
              <option value="cardCountDesc">Most cards first</option>
              <option value="ownedCount">Fewest owned first</option>
              <option value="ownedCountDesc">Most owned first</option>
            </select>
          </div>
        </>}
      </CollapsibleSection>
    </div>
  );
};
