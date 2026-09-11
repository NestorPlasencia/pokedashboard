import { LayoutGrid, Library, Sigma, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useWishlists } from "../context/WishlistsContext";
import React, { Suspense, lazy, useMemo, useState } from "react";
import { Filters } from "./inputs/Filters";
import { Orders } from "./inputs/Orders";
import { Search } from "./inputs/Search";
import { PriceRangeFilter } from "./inputs/PriceRangeFilter";
import { Sidebar } from "./ui/Sidebar";
import { useCardContext } from "../context/CardContext";
import { useOptionsContext } from "../context/OptionsContext";
import './main.css';
import { Collections } from "./inputs/Collections";
import { PokemonGroupingFilter } from "./inputs/PokemonGroupingFilter";
import { ViewOptionsComponent } from "./inputs/ViewOptionsComponent";
import { useLoadCards } from "../hooks/useLoadCards";
import { useCardFilters } from "../hooks/useCardFilters";
import { Summary } from "./ui/Summary";
import { PrintButton } from "./ui/PrintButton";
import { CachePanel } from "./ui/CachePanel";
import { ThemeSelector } from "./ui/ThemeSelector";
import { MassEntryButton } from "./ui/MassEntryButton";
import { PriceExplorerButton } from "./ui/PriceExplorerButton";
import { AppNav } from "./ui/AppNav";
import { CollectionsPage } from "./pages/CollectionsPage";
import { useTrendPoints } from "../hooks/useTrendPoints";
import { useOfflineStatus } from "../hooks/useOfflineStatus";
import { useRoute } from "../hooks/useRoute";
import { navigate } from "../utils/route";
import { assertNeverViewMode } from "../utils/viewMode";
import { collectionScopeNames } from "../utils/collectionTree";

// Lazy load heavy view components
const CardList = lazy(() => import("./views/CardList").then(module => ({ default: module.CardList })));
const CardListTable = lazy(() => import("./views/CardListTable").then(module => ({ default: module.CardListTable })));

type MobilePanel = 'filters' | 'cards' | 'summary';

const MOBILE_NAVIGATION: { id: MobilePanel; label: string; Icon: LucideIcon }[] = [
  { id: 'filters', label: 'Filters', Icon: SlidersHorizontal },
  { id: 'cards', label: 'Cards', Icon: LayoutGrid },
  { id: 'summary', label: 'Summary', Icon: Sigma },
];

export const Main: React.FC = () => {
  const wishlists = useWishlists();
  const route = useRoute();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('cards');
  const {
    setAllCards,
    viewOptions,
    setSets,
    setPokemonFormsData,
    seriesSelection,
    collectionFilter,
    pokemonGrouping,
    viewMode,
  } = useCardContext();
  const { collections, setCollections } = useOptionsContext();
  // A collection shows the cards of its subcollections too.
  const viewedCollectionScope = useMemo(
    () => (viewMode.kind === 'collection' ? collectionScopeNames(collections, viewMode.name) : []),
    [collections, viewMode]
  );
  const inventoryRequired =
    collectionFilter.selectedCollections.length > 0 ||
    (pokemonGrouping.enabled && pokemonGrouping.filterByCollection !== "all");

  // One place decides what the current mode needs from the loader. Adding a mode to
  // ViewMode without handling it here stops compiling.
  const modeOptions = ((): { series: typeof seriesSelection; collection: string } => {
    switch (viewMode.kind) {
      case 'catalog':
        return { series: seriesSelection, collection: '' };
      case 'wishlist':
        // Saved cards come from whichever eras the wishlist touches, not the sidebar.
        return { series: wishlists.seriesSelection, collection: '' };
      case 'collection':
        return { series: seriesSelection, collection: viewMode.name };
      default:
        return assertNeverViewMode(viewMode);
    }
  })();

  const {
    isLoading,
    isInventoryEmpty,
    inventoryStatus,
    inventoryUpdatedAt,
    inventoryError,
    collectionCardCounts,
    collectionCopyCounts,
    collectionEnrichment,
    error,
  } = useLoadCards(
    setAllCards,
    setCollections,
    setSets,
    setPokemonFormsData,
    modeOptions.series,
    inventoryRequired || Boolean(modeOptions.collection),
    modeOptions.collection,
    viewMode.kind === 'wishlist',
    viewedCollectionScope
  );

  // Activate hierarchical filter cascade (Levels 2-6)
  // Level 1 is handled by Filters component
  useCardFilters();
  const { trendError } = useTrendPoints();
  const { online, servingStale } = useOfflineStatus();

  // Determine which view to show based on displayMode
  const showListTable = viewOptions.displayMode.includes('table');

  return (
    <>
      {/* The catalog stays mounted while another page is open. Its cards, filters and
          scroll position survive the round trip, and it is what loads the collection list
          and the inventory the Collections page reads. */}
      <div className={`main mobile-panel--${mobilePanel}`} hidden={route !== 'catalog'}>
        <Sidebar position="left">
          <AppNav />
          <Filters />
          <PriceRangeFilter />
          <Collections />
          <Orders />
          <PokemonGroupingFilter />
          <ViewOptionsComponent />
          <PriceExplorerButton />
          <MassEntryButton />
          <PrintButton busy={isLoading} />
          {/* Below the divider sit the things that configure the app rather than the card
              list: storage and appearance. Keeping the cache panel here leaves the
              collapsible panels and the action buttons as two unbroken groups. The account -
              signing in and out - lives on the Collections page, the part that needs it. */}
          <div className="sidebar-footer">
            <CachePanel />
            <ThemeSelector />
          </div>
        </Sidebar>
        <div className={`card-view${viewMode.kind === 'wishlist' ? ' card-view--wishlist' : ''}`}>
          <Search collectionEnrichment={viewMode.kind === 'collection' ? collectionEnrichment : undefined} />
          {(!online || servingStale) && (
            <div className="main-status-message main-status-message--warning">
              {online
                ? 'Some data could not be refreshed, so saved copies are being shown.'
                : 'You are offline. Showing the cards and prices saved on this device.'}
            </div>
          )}
          {isLoading && (
            <div className="main-status-message main-status-message--loading" role="status">
              {viewMode.kind === 'collection' ? 'Loading collection…' : 'Loading cards…'}
            </div>
          )}
          {error && <div className="main-status-message main-status-message--error">{error}</div>}
          {inventoryError && <div className="main-status-message main-status-message--warning">{inventoryError}</div>}
          {trendError && viewOptions.displayMode.includes('trend') && <div className="main-status-message main-status-message--warning">{trendError}</div>}
          {!isLoading && !error && isInventoryEmpty && (
            <div className="main-status-message main-status-message--warning">
              Your Supabase inventory has no active card copies.
            </div>
          )}
          {!isLoading && !error && (
            <Suspense fallback={<div className="main-status-message">Loading view...</div>}>
              {showListTable ? <CardListTable /> : <CardList />}
            </Suspense>
          )}
        </div>
        <Sidebar position="right">
          <Summary />
        </Sidebar>
      </div>
      {route === 'collections' && (
        <CollectionsPage
          inventoryStatus={inventoryStatus}
          inventoryUpdatedAt={inventoryUpdatedAt}
          cardCounts={collectionCardCounts}
          copyCounts={collectionCopyCounts}
        />
      )}
      {/* Outside the catalog so it stays on every page. A panel button from another page
          returns to the catalog with that panel open. */}
      <nav className="mobile-panel-nav" aria-label="Mobile sections">
        {MOBILE_NAVIGATION.map(({ id, label, Icon }) => {
          const isActive = route === 'catalog' && mobilePanel === id;
          return (
            <button
              key={id}
              type="button"
              className={isActive ? 'is-active' : ''}
              aria-pressed={isActive}
              onClick={() => { setMobilePanel(id); navigate('catalog'); }}
            >
              <Icon className="mobile-panel-nav__icon" size={20} aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
        {/* A page rather than a panel, but on a phone this bar is where the thumb looks. */}
        <button
          type="button"
          className={route === 'collections' ? 'is-active' : ''}
          aria-current={route === 'collections' ? 'page' : undefined}
          onClick={() => navigate('collections')}
        >
          <Library className="mobile-panel-nav__icon" size={20} aria-hidden="true" />
          <span>Collections</span>
        </button>
      </nav>
    </>
  );
};
