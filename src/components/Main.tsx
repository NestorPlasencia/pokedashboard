import { BookOpen, LayoutGrid, Library, Settings, Sigma, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useWishlists } from "../context/WishlistsContext";
import { useOwnedCollections } from "../context/OwnedCollectionsContext";
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Filters } from "./inputs/Filters";
import { Search } from "./inputs/Search";
import { PriceRangeFilter } from "./inputs/PriceRangeFilter";
import { Sidebar } from "./ui/Sidebar";
import { useCardContext } from "../context/CardContext";
import { useOptionsContext } from "../context/OptionsContext";
import './main.css';
import { Collections } from "./inputs/Collections";
import { useLoadCards } from "../hooks/useLoadCards";
import { useCardFilters } from "../hooks/useCardFilters";
import { Summary } from "./ui/Summary";
import { CollectionsPage } from "./pages/CollectionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PokedexPage } from "./pages/PokedexPage";
import { useTrendPoints } from "../hooks/useTrendPoints";
import { useOfflineStatus } from "../hooks/useOfflineStatus";
import { useRoute } from "../hooks/useRoute";
import { navigate } from "../utils/route";
import { assertNeverViewMode } from "../utils/viewMode";
import { collectionScopeNames } from "../utils/collectionTree";
import { updateUrlParams } from "../utils/urlParams";
import { viewOptionsToParams } from "../utils/urlState";
import { useAuth } from "../context/AuthContext";
import { applyPokedexProject, readPokedexProjects } from "../services/pokedexProjects";

// Lazy load heavy view components
const CardList = lazy(() => import("./views/CardList").then(module => ({ default: module.CardList })));
const CardListTable = lazy(() => import("./views/CardListTable").then(module => ({ default: module.CardListTable })));
const BinderView = lazy(() => import("./views/BinderView").then(module => ({ default: module.BinderView })));

type MobilePanel = 'filters' | 'cards' | 'summary';

const MOBILE_NAVIGATION: { id: MobilePanel; label: string; Icon: LucideIcon }[] = [
  { id: 'filters', label: 'Filters', Icon: SlidersHorizontal },
  { id: 'cards', label: 'Cards', Icon: LayoutGrid },
  { id: 'summary', label: 'Summary', Icon: Sigma },
];

export const Main: React.FC = () => {
  const { session, isAuthLoading } = useAuth();
  const wishlists = useWishlists();
  const owned = useOwnedCollections();
  const route = useRoute();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('cards');
  // Desktop's two asides are independent - both can be open at once, unlike mobile's one
  // panel at a time - so the dock's Filters and Summary buttons just toggle their own
  // aside, same as the arrow does. Cards is the odd one out: it always clears both, for
  // a quick full-width view of the list.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);

  // A fresh desktop session starts with Filters open and Summary tucked away; resizing
  // up from mobile lands on the same defaults rather than whatever mobile last implied.
  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 761px)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      setLeftCollapsed(false);
      setRightCollapsed(true);
    };
    desktopQuery.addEventListener('change', handleChange);
    return () => desktopQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleLeftAside = () => {
    navigate('catalog');
    setLeftCollapsed((prev) => !prev);
  };
  const toggleRightAside = () => {
    navigate('catalog');
    setRightCollapsed((prev) => !prev);
  };
  const showOnlyCards = () => {
    navigate('catalog');
    setLeftCollapsed(true);
    setRightCollapsed(true);
  };
  const {
    setAllCards,
    viewOptions,
    setSets,
    setPokemonFormsData,
    seriesSelection,
    collectionFilter,
    pokemonGrouping,
    setPokemonGrouping,
    viewMode,
  } = useCardContext();
  useEffect(() => {
    updateUrlParams(viewOptionsToParams(viewOptions));
  }, [viewOptions]);
  // Restore the last Pokédex project once the account is known. Projects are local
  // until the shared database can store them, and are kept separate by account ID.
  useEffect(() => {
    if (isAuthLoading) return;
    try {
      const saved = readPokedexProjects(session?.user.id ?? "");
      const active = saved.projects.find((project) => project.id === saved.activeId);
      if (active) setPokemonGrouping((current) => applyPokedexProject(current, active));
    } catch (error) {
      console.warn("[pokedex] Unable to restore saved projects", error);
    }
  }, [isAuthLoading, session?.user.id, setPokemonGrouping]);
  // Grouping can now be edited from either Settings or the Pokédex page.
  useEffect(() => {
    updateUrlParams({
      pokemonGroupingEnabled: pokemonGrouping.enabled ? 'true' : 'false',
      filterByCollection: pokemonGrouping.filterByCollection,
      groupingRegions: pokemonGrouping.groupingRegions,
      formsAllowVariants: pokemonGrouping.allowVariants,
      formsHideVariants: pokemonGrouping.hideVariants,
      formsGroupSortBy: pokemonGrouping.groupSortBy,
      formsFallbackToDefault: pokemonGrouping.fallbackToDefault ? 'true' : 'false',
      pokemonGroupingMode: undefined,
      groupByPokedex: undefined,
      groupByForms: undefined,
      includeWithoutCards: undefined,
      formsFilterByCollection: undefined,
      formsGroupingRegions: undefined,
      formsEnabledVariants: undefined,
    });
  }, [pokemonGrouping]);
  const { collections, setCollections } = useOptionsContext();
  // A collection shows the cards of its subcollections too; browsing several at once
  // is the union of every one of their scopes.
  const viewedCollectionScope = useMemo(
    () => (viewMode.kind === 'collection'
      ? Array.from(new Set(viewMode.names.flatMap((name) => collectionScopeNames(collections, name))))
      : []),
    [collections, viewMode]
  );
  // Everything that actually reads the snapshot: the collection filter, grouping that
  // filters by collection, the Collections page's counts, and an armed collection - whose
  // Add/Remove button has to know what that collection already holds. Leaving the armed
  // case out is what kept the button on "Add" no matter how much had been downloaded.
  const inventoryRequired =
    collectionFilter.selectedCollections.length > 0 ||
    (pokemonGrouping.enabled && pokemonGrouping.filterByCollection !== "all") ||
    Boolean(owned.selectedId) ||
    route === 'collections';

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
        return { series: seriesSelection, collection: viewMode.names.join(', ') };
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
  const showBinder = viewOptions.displayMode.includes('binder');

  return (
    <>
      {/* The catalog stays mounted while another page is open. Its cards, filters and
          scroll position survive the round trip, and it is what loads the collection list
          and the inventory the Collections page reads. */}
      <div className={`main mobile-panel--${mobilePanel}`} hidden={route !== 'catalog'}>
        <Sidebar position="left" collapsed={leftCollapsed} onToggle={() => setLeftCollapsed((prev) => !prev)}>
          <Filters />
          <PriceRangeFilter />
          <Collections />
        </Sidebar>
        <div className={`card-view${viewMode.kind === 'wishlist' ? ' card-view--wishlist' : ''}`}>
          <Search collectionEnrichment={viewMode.kind === 'collection' ? collectionEnrichment : undefined} loading={isLoading} />
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
              {showListTable ? <CardListTable /> : showBinder ? <BinderView /> : <CardList />}
            </Suspense>
          )}
        </div>
        <Sidebar position="right" collapsed={rightCollapsed} onToggle={() => setRightCollapsed((prev) => !prev)}>
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
      {route === 'settings' && <SettingsPage printBusy={isLoading} />}
      {route === 'pokedex' && <PokedexPage />}
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
        <button
          type="button"
          className={route === 'pokedex' ? 'is-active' : ''}
          aria-current={route === 'pokedex' ? 'page' : undefined}
          onClick={() => navigate('pokedex')}
        >
          <BookOpen className="mobile-panel-nav__icon" size={20} aria-hidden="true" />
          <span>Pokédex</span>
        </button>
        <button
          type="button"
          className={route === 'settings' ? 'is-active' : ''}
          aria-current={route === 'settings' ? 'page' : undefined}
          onClick={() => navigate('settings')}
        >
          <Settings className="mobile-panel-nav__icon" size={20} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </nav>
      {/* Desktop's counterpart to the bar above: the same destinations, driving the two
          asides instead of swapping the whole screen. Filters and Summary each toggle
          their own aside - both can be open together - while Cards clears both at once. */}
      <nav className="desktop-dock" aria-label="Quick panels">
        <button
          type="button"
          className={route === 'catalog' && !leftCollapsed ? 'is-active' : ''}
          aria-pressed={route === 'catalog' && !leftCollapsed}
          onClick={toggleLeftAside}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>Filters</span>
        </button>
        <button
          type="button"
          className={route === 'catalog' && leftCollapsed && rightCollapsed ? 'is-active' : ''}
          aria-pressed={route === 'catalog' && leftCollapsed && rightCollapsed}
          onClick={showOnlyCards}
        >
          <LayoutGrid size={16} aria-hidden="true" />
          <span>Cards</span>
        </button>
        <button
          type="button"
          className={route === 'catalog' && !rightCollapsed ? 'is-active' : ''}
          aria-pressed={route === 'catalog' && !rightCollapsed}
          onClick={toggleRightAside}
        >
          <Sigma size={16} aria-hidden="true" />
          <span>Summary</span>
        </button>
        <button
          type="button"
          className={route === 'collections' ? 'is-active' : ''}
          aria-current={route === 'collections' ? 'page' : undefined}
          onClick={() => navigate('collections')}
        >
          <Library size={16} aria-hidden="true" />
          <span>Collections</span>
        </button>
        <button
          type="button"
          className={route === 'pokedex' ? 'is-active' : ''}
          aria-current={route === 'pokedex' ? 'page' : undefined}
          onClick={() => navigate('pokedex')}
        >
          <BookOpen size={16} aria-hidden="true" />
          <span>Pokédex</span>
        </button>
        <button
          type="button"
          className={route === 'settings' ? 'is-active' : ''}
          aria-current={route === 'settings' ? 'page' : undefined}
          onClick={() => navigate('settings')}
        >
          <Settings size={16} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </nav>
    </>
  );
};
