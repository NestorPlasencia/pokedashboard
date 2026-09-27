import { PokedexProjectControls } from "../inputs/PokedexProjectControls";
import { PokedexProjectOptions } from "../inputs/PokedexProjectOptions";
import { PokedexProjectForms } from "../inputs/PokedexProjectForms";
import { PokedexPreview } from "../inputs/PokedexPreview";
import { PokedexGroupingOptions } from "../inputs/PokedexGroupingOptions";

export const PokedexPage = () => (
  <div className="collections-page pokedex-page">
    <main className="collections-page__body">
      <div className="collections-page__intro">
        <h1>Pokédex</h1>
        <p>Choose a Pokédex, then adjust its regions and forms.</p>
      </div>
      <section className="section-sidebar pokedex-projects-card">
        <PokedexProjectControls />
        <PokedexGroupingOptions />
      </section>
      <PokedexPreview />
      <PokedexProjectOptions />
      <PokedexProjectForms />
    </main>
  </div>
);
