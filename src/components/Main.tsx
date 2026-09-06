import { LayoutGrid, Sigma, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useWishlists } from "../context/WishlistsContext";
import { Wishlists } from "./ui/Wishlists";
import React, { Suspense, lazy, useState } from "react";
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
import { useUrlFilters } from "../hooks/useUrlFilters";
import { useCardFilters } from "../hooks/useCardFilters";
import { Summary } from "./ui/Summary";
import { PrintButton } from "./ui/PrintButton";
import { ThemeSelector } from "./ui/ThemeSelector";
import { MassEntryButton } from "./ui/MassEntryButton";
import { PriceExplorerButton } from "./ui/PriceExplorerButton";
import { useAuth } from "../context/AuthContext";
import { useTrendPoints } from "../hooks/useTrendPoints";

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
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('cards');
  const {
    setAllCards,
    viewOptions,
    setSets,
    setPokemonFormsData,
    seriesSelection,
    collectionFilter,
    pokemonGrouping,
  } = useCardContext();
  const { setCollections } = useOptionsContext();
  const { session, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  const inventoryRequired =
    collectionFilter.enabled ||
    (pokemonGrouping.enabled && pokemonGrouping.filterByCollection !== "all");

  const {
    isLoading,
    isInventoryEmpty,
    inventoryStatus,
    inventoryUpdatedAt,
    inventoryError,
    error,
  } = useLoadCards(
    setAllCards,
    setCollections,
    setSets,
    setPokemonFormsData,
    wishlists.viewing ? wishlists.seriesSelection : seriesSelection,
    inventoryRequired
  );

  // Sincronizar filtros con URL
  useUrlFilters();

  // Activate hierarchical filter cascade (Levels 2-6)
  // Level 1 is handled by Filters component
  useCardFilters();
  const { trendError } = useTrendPoints();

  // Determine which view to show based on displayMode
  const showListTable = viewOptions.displayMode.includes('table');

  return (
    <div className={`main mobile-panel--${mobilePanel}`}>
      <Sidebar position="left">
        <Filters />
        <PriceRangeFilter />
        <Orders />
        <Collections
          inventoryStatus={inventoryStatus}
          inventoryUpdatedAt={inventoryUpdatedAt}
        />
        <PokemonGroupingFilter />
        <ViewOptionsComponent />
        <Wishlists busy={isLoading} />
        <PriceExplorerButton />
        <MassEntryButton />
        <PrintButton busy={isLoading} />
        <div className="sidebar-footer">
          <ThemeSelector />
          {session && (
            <div className="session-bar sidebar-session-bar">
              <span>{session.user.email}</span>
              <button type="button" onClick={handleSignOut}>Sign out</button>
            </div>
          )}
        </div>
      </Sidebar>
      <div className={`card-view${wishlists.viewing ? ' card-view--wishlist' : ''}`}>
        <Search />
        {isLoading && <div className="main-status-message">Loading cards...</div>}
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
      <nav className="mobile-panel-nav" aria-label="Mobile sections">
        {MOBILE_NAVIGATION.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={mobilePanel === id ? 'is-active' : ''}
            aria-pressed={mobilePanel === id}
            onClick={() => setMobilePanel(id)}
          >
            <Icon className="mobile-panel-nav__icon" size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};
