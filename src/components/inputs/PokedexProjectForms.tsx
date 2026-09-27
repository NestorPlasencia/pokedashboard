import { useMemo, useState } from "react";
import { useCardContext } from "../../context/CardContext";
import { shouldIncludePokemonForm } from "../../utils/filters";
import { formBelongsToRegions } from "../../utils/pokedexRegions";

export const PokedexProjectForms = () => {
  const { pokemonGrouping, setPokemonGrouping, pokemonFormsData } = useCardContext();
  const [search, setSearch] = useState("");
  const candidateForms = useMemo(() => {
    const regions = pokemonGrouping.groupingRegions;
    return pokemonFormsData
      .filter((form) =>
        formBelongsToRegions(form, regions) &&
        shouldIncludePokemonForm(form, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants)
      )
      .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  }, [pokemonFormsData, pokemonGrouping.groupingRegions, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants]);

  const excludedIds = useMemo(() => new Set(pokemonGrouping.excludedFormIds), [pokemonGrouping.excludedFormIds]);
  const includedCount = candidateForms.filter((form) => !excludedIds.has(form.id)).length;
  const visibleForms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return candidateForms.filter((form) =>
      !query || form.name.toLowerCase().includes(query) ||
      form.pokemon.name.toLowerCase().includes(query) || String(form.number).includes(query)
    ).slice(0, 100);
  }, [candidateForms, search]);

  const toggleForm = (id: number) => setPokemonGrouping((current) => ({
    ...current,
    excludedFormIds: current.excludedFormIds.includes(id)
      ? current.excludedFormIds.filter((entry) => entry !== id)
      : [...current.excludedFormIds, id],
  }));

  return <section className="section-sidebar pokedex-projects-card">
    <h2>3. Individual forms</h2>
    <p>Remove a form that does not belong in this placeholder. This does not remove the variant from other Pokémon.</p>
    <details className="pokedex-projects__forms">
      <summary>{includedCount}/{candidateForms.length} forms included</summary>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a Pokémon or form" aria-label="Find a Pokémon or form" />
      <div className="pokedex-projects__form-list">
        {visibleForms.map((form) => {
          const excluded = excludedIds.has(form.id);
          return <div className="pokedex-projects__form" key={form.id}>
            <span>#{form.number} {form.name}</span>
            <button type="button" onClick={() => toggleForm(form.id)} aria-label={`${excluded ? "Restore" : "Remove"} ${form.name}`}>
              {excluded ? "Restore" : "Remove"}
            </button>
          </div>;
        })}
        {candidateForms.length === 0 && <p>{pokemonFormsData.length === 0 ? "Form catalog is loading or unavailable." : "No forms match these regions and variants."}</p>}
      </div>
      {candidateForms.length > 100 && <small>Showing up to 100 forms. Search to find another.</small>}
    </details>
    <p>Use “Update” above to keep changes to an existing placeholder, or “Save as new placeholder” to create one.</p>
  </section>;
};
