import { useCardContext } from "../../context/CardContext";

export const PokedexGroupingOptions = () => {
  const { pokemonGrouping, setPokemonGrouping } = useCardContext();
  const orderLabel = {
    default: "Pokédex number",
    cardCount: "Fewest cards",
    cardCountDesc: "Most cards",
    ownedCount: "Fewest owned copies",
    ownedCountDesc: "Most owned copies",
  }[pokemonGrouping.groupSortBy];

  return (
    <details className="pokedex-projects__settings">
      <summary>Group settings <span>{orderLabel}</span></summary>
      <div className="pokedex-projects__settings-content">
        <div className="pokedex-filter-group">
          <label htmlFor="formsGroupSortSelect">Group order</label>
          <select
            id="formsGroupSortSelect"
            value={pokemonGrouping.groupSortBy}
            onChange={(event) => setPokemonGrouping((current) => ({
              ...current,
              groupSortBy: event.target.value as typeof current.groupSortBy,
            }))}
            className="pokedex-filter-select"
          >
            <option value="default">Pokédex number</option>
            <option value="cardCount">Fewest cards first</option>
            <option value="cardCountDesc">Most cards first</option>
            <option value="ownedCount">Fewest owned copies first</option>
            <option value="ownedCountDesc">Most owned copies first</option>
          </select>
        </div>
        <small>The Cards header sorts cards within each group.</small>
        <label className="pokedex-projects__toggle">
          <input
            type="checkbox"
            checked={pokemonGrouping.fallbackToDefault}
            onChange={() => setPokemonGrouping((current) => ({
              ...current, fallbackToDefault: !current.fallbackToDefault,
            }))}
            aria-label="Group unlisted forms under the default form"
          />
          <span>Group unlisted forms under default</span>
        </label>
      </div>
    </details>
  );
};
