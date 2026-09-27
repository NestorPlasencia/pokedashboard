import { useMemo } from "react";
import { useCardContext } from "../../context/CardContext";
import { POKEMON_FORM_VARIANTS_ORDER } from "../../constants/constants";

const REGIONS = ["All", "Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar", "Hisui", "Paldea"];

export const PokedexProjectOptions = () => {
  const { pokemonGrouping, setPokemonGrouping, pokemonFormsData } = useCardContext();
  const variants = useMemo(() => {
    const counts = new Map<string, number>();
    pokemonFormsData.forEach((form) => form.variants.forEach((entry) => {
      const name = entry.pokemonVariant.name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }));
    return ["Default", ...[...counts.keys()].sort((a, b) => {
      const aIndex = POKEMON_FORM_VARIANTS_ORDER.indexOf(a);
      const bIndex = POKEMON_FORM_VARIANTS_ORDER.indexOf(b);
      const first = aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex;
      const second = bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex;
      return first - second || (first === Number.MAX_SAFE_INTEGER
        ? (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b) : 0);
    })];
  }, [pokemonFormsData]);

  const toggleRegion = (region: string) => setPokemonGrouping((current) => {
    if (region === "All") return { ...current, groupingRegions: ["All"] };
    const selected = current.groupingRegions.filter((entry) => entry !== "All");
    const groupingRegions = selected.includes(region)
      ? selected.filter((entry) => entry !== region)
      : [...selected, region];
    return { ...current, groupingRegions: groupingRegions.length ? groupingRegions : ["All"] };
  });

  const toggleVariant = (variant: string, mode: "allow" | "hide") => setPokemonGrouping((current) => {
    const key = mode === "allow" ? "allowVariants" : "hideVariants";
    const selected = current[key];
    return { ...current, [key]: selected.includes(variant)
      ? selected.filter((entry) => entry !== variant)
      : [...selected, variant] };
  });

  return <div className="pokedex-project-options">
    <section className="section-sidebar">
      <h2>1. Regions</h2>
      <p>Choose the Pokémon that belong in this project.</p>
      <div className="pokedex-project-options__regions">
        {REGIONS.map((region) => <label key={region} className="pokedex-region-option">
          <input
            type="checkbox"
            checked={pokemonGrouping.groupingRegions.includes(region)}
            onChange={() => toggleRegion(region)}
            aria-label={`Include region ${region}`}
          />
          <span className="pokedex-region-label">{region}</span>
        </label>)}
      </div>
    </section>
    <section className="section-sidebar">
      <h2>2. Variants</h2>
      <p>Allow the forms you want. Hide a variant only when you want to exclude it throughout the project.</p>
      <div className="pokedex-project-options__variants">
        <div className="forms-variant-legend">
          <span className="forms-variant-legend-name">Variant</span>
          <span className="forms-variant-legend-toggle">Allow</span>
          <span className="forms-variant-legend-toggle">Hide</span>
        </div>
        {variants.map((variant) => <div key={variant} className="forms-variant-option">
          <span className="pokedex-region-label">{variant}</span>
          <input
            type="checkbox"
            checked={pokemonGrouping.allowVariants.includes(variant)}
            onChange={() => toggleVariant(variant, "allow")}
            aria-label={`Allow variant ${variant}`}
          />
          <input
            type="checkbox"
            checked={pokemonGrouping.hideVariants.includes(variant)}
            onChange={() => toggleVariant(variant, "hide")}
            aria-label={`Hide variant ${variant}`}
          />
        </div>)}
      </div>
    </section>
  </div>;
};
