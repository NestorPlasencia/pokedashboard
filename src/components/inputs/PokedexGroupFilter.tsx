import { useCardContext } from "../../context/CardContext";
import { CollapsibleSection } from "../ui/CollapsibleSection";

const GROUP_OPTIONS = [
  { value: "all", label: "All Pokémon" },
  { value: "owned", label: "With catalog cards" },
  { value: "notOwned", label: "Without catalog cards" },
  { value: "ownedAny", label: "With owned cards" },
  { value: "ownedNone", label: "Groups with no owned cards" },
] as const;

export const PokedexGroupFilter = () => {
  const { pokemonGrouping, setPokemonGrouping } = useCardContext();
  const selected = GROUP_OPTIONS.find((option) => option.value === pokemonGrouping.filterByCollection);

  return <CollapsibleSection title="Pokédex groups" defaultCollapsed={true} collapsedSummary={selected?.label}>
    <p>Choose which groups from the active Pokédex appear in Cards. “Catalog cards” means cards in the current results; ownership uses selected collections, or all collections when none are selected.</p>
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
        {GROUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  </CollapsibleSection>;
};
