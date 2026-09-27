import { PokedexProjectControls } from "../inputs/PokedexProjectControls";
import { PokedexProjectOptions } from "../inputs/PokedexProjectOptions";
import { PokedexProjectForms } from "../inputs/PokedexProjectForms";
import { PokedexPreview } from "../inputs/PokedexPreview";
import { PokedexGroupingOptions } from "../inputs/PokedexGroupingOptions";

export const PokedexPage = () => (
  <div className="collections-page">
    <main className="collections-page__body">
      <div className="collections-page__intro">
        <h1>Pokédex</h1>
        <p>Choose or create a Pokédex for the Pokémon groups shown in the catalog or any collection.</p>
      </div>
      <section className="section-sidebar pokedex-projects-card">
        <PokedexProjectControls />
      </section>
      <PokedexGroupingOptions />
      <PokedexPreview />
      <PokedexProjectOptions />
      <PokedexProjectForms />
    </main>
  </div>
);
