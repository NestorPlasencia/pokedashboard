import { PokemonGroupingFilter } from "../inputs/PokemonGroupingFilter";
import { ViewOptionsComponent } from "../inputs/ViewOptionsComponent";
import { PriceExplorerButton } from "../ui/PriceExplorerButton";
import { MassEntryButton } from "../ui/MassEntryButton";
import { PrintButton } from "../ui/PrintButton";
import { CachePanel } from "../ui/CachePanel";
import { ThemeSelector } from "../ui/ThemeSelector";
import { AccountPasswordForm } from "../ui/AccountPasswordForm";

type SettingsPageProps = {
  /** Whether the catalog is still loading its cards - Print waits on the same thing it did in the sidebar. */
  printBusy: boolean;
};

/**
 * Everything that configures how the catalog behaves or looks, rather than what cards it
 * shows: Pokémon grouping, view options, the export tools, offline storage and appearance.
 * Kept off the catalog's own sidebar so that one stays about filtering and browsing cards.
 */
export const SettingsPage = ({ printBusy }: SettingsPageProps) => (
  <div className="collections-page">
    <main className="collections-page__body">
      <div className="collections-page__intro">
        <h1>Settings</h1>
        <p>Grouping, view options, export tools, offline storage and appearance - everything that shapes how the catalog behaves rather than what it shows.</p>
      </div>
      <AccountPasswordForm />
      <PokemonGroupingFilter />
      <ViewOptionsComponent />
      <div className="section-sidebar">
        <PriceExplorerButton />
        <MassEntryButton />
        <PrintButton busy={printBusy} />
      </div>
      <div className="sidebar-footer">
        <CachePanel />
        <ThemeSelector />
      </div>
    </main>
  </div>
);
