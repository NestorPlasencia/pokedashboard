import { PokedexProjectControls } from "../inputs/PokedexProjectControls";
import { PokedexProjectOptions } from "../inputs/PokedexProjectOptions";
import { PokedexProjectForms } from "../inputs/PokedexProjectForms";

export const PokedexPage = () => (
  <div className="collections-page">
    <main className="collections-page__body">
      <div className="collections-page__intro">
        <h1>Pokédex</h1>
        <p>Create and save projects that define the Pokémon groups and placeholders shown in the catalog or any collection.</p>
      </div>
      <section className="section-sidebar pokedex-projects-card">
        <PokedexProjectControls />
      </section>
      <PokedexProjectOptions />
      <PokedexProjectForms />
    </main>
  </div>
);
