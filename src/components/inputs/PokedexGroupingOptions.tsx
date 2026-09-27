import { useCardContext } from "../../context/CardContext";

export const PokedexGroupingOptions = () => {
  const { pokemonGrouping, setPokemonGrouping } = useCardContext();

  return (
    <section className="section-sidebar pokedex-projects-card">
      <h2>Grouping options</h2>
      <p>Set the order of Pokédex groups. The global Cards order controls cards inside each group.</p>
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
        <label htmlFor="formsGroupSortSelect">Group order:</label>
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
    </section>
  );
};
