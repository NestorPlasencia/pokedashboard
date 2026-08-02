import React, { Suspense, lazy } from "react";
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

// Lazy load heavy view components
const CardList = lazy(() => import("./views/CardList").then(module => ({ default: module.CardList })));
const CardListTable = lazy(() => import("./views/CardListTable").then(module => ({ default: module.CardListTable })));

export const Main: React.FC = () => {
  const { setAllCards, viewOptions, setSets, setPokemonFormsData, seriesSelection } = useCardContext();
  const { setCollections } = useOptionsContext();

  const { isLoading, error } = useLoadCards(
    setAllCards,
    setCollections,
    setSets,
    setPokemonFormsData,
    seriesSelection
  );

  // Sincronizar filtros con URL
  useUrlFilters();

  // Activate hierarchical filter cascade (Levels 2-6)
  // Level 1 is handled by Filters component
  useCardFilters();

  // Determine which view to show based on displayMode
  const showListTable = viewOptions.displayMode.includes('table');

  return (
    <div className="main">
      <Sidebar position="left">
        <Filters />
        <PriceRangeFilter />
        <Orders />
        <Collections />
        <PokemonGroupingFilter />
        <ViewOptionsComponent />
        <PrintButton />
      </Sidebar>
      <div className="card-view">
        <Search />
        {isLoading && <div className="main-status-message">Loading cards...</div>}
        {error && <div className="main-status-message main-status-message--error">{error}</div>}
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
  );
};
