import { useMemo, useState } from "react";
import { useCardContext } from "../../context/CardContext";
import { getRegionForPokedexNumber } from "../../constants/constants";
import { shouldIncludePokemonForm } from "../../utils/filters";
import { formBelongsToRegions } from "../../utils/pokedexRegions";

const PAGE_SIZE = 50;

export const PokedexPreview = () => {
  const { pokemonGrouping, pokemonFormsData } = useCardContext();
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const includedForms = useMemo(() => {
    const excludedIds = new Set(pokemonGrouping.excludedFormIds);
    return pokemonFormsData
      .filter((form) =>
        formBelongsToRegions(form, pokemonGrouping.groupingRegions) &&
        shouldIncludePokemonForm(form, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants) &&
        !excludedIds.has(form.id)
      )
      .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  }, [pokemonFormsData, pokemonGrouping.groupingRegions, pokemonGrouping.allowVariants,
    pokemonGrouping.hideVariants, pokemonGrouping.excludedFormIds]);

  const matchingForms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? includedForms.filter((form) =>
      form.name.toLowerCase().includes(query) ||
      form.pokemon.name.toLowerCase().includes(query) ||
      String(form.number).includes(query)
    ) : includedForms;
  }, [includedForms, search]);
  const speciesCount = new Set(includedForms.map((form) => form.number)).size;

  return <details className="section-sidebar pokedex-projects-card pokedex-preview">
    <summary>Preview Pokédex</summary>
    <p>See the Pokémon and forms in the current selection, including changes you have not saved yet.</p>
    {pokemonFormsData.length === 0 ? <p>Form catalog is loading or unavailable.</p> : <>
      <p className="pokedex-preview__count">{speciesCount.toLocaleString()} Pokémon · {includedForms.length.toLocaleString()} forms</p>
      <input
        value={search}
        onChange={(event) => { setSearch(event.target.value); setVisibleCount(PAGE_SIZE); }}
        placeholder="Find a Pokémon or form"
        aria-label="Search Pokédex preview"
      />
      <div className="pokedex-preview__list">
        {matchingForms.slice(0, visibleCount).map((form) => <div className="pokedex-preview__row" key={form.id}>
          <span className="pokedex-preview__number">#{String(form.number).padStart(4, "0")}</span>
          <span className="pokedex-preview__name">{form.name}</span>
          <span className="pokedex-preview__detail">{getRegionForPokedexNumber(form.number)}</span>
          {!form.isDefault && <span className="pokedex-preview__detail">{form.variants.map((entry) => entry.pokemonVariant.name).join(", ")}</span>}
        </div>)}
      </div>
      {matchingForms.length === 0 && <p>No forms match this preview.</p>}
      {matchingForms.length > visibleCount && <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
        Show more ({Math.min(visibleCount, matchingForms.length)} of {matchingForms.length})
      </button>}
    </>}
  </details>;
};
