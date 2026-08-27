import { useEffect, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";
import type { ViewOptions } from "../../types/dashboard";

export const ViewOptionsComponent = () => {
  const { viewOptions, setViewOptions, pokemonGrouping } = useCardContext();
  const isFirstRenderRef = useRef(true);

  // Initialize from URL on component mount
  useEffect(() => {
    const params = parseUrlParams();
    const showTable = params.showTable === 'true' || params.showListTable === 'true';
    const showTrendPoints = params.showTrendPoints === 'true';
    
    if (showTrendPoints) {
      setViewOptions(prev => ({ ...prev, displayMode: 'trendUngrouped' }));
    } else if (showTable && !viewOptions.displayMode.includes('table')) {
      setViewOptions(prev => ({ 
        ...prev, 
        displayMode: 'tableUngrouped'
      }));
    }
    
    isFirstRenderRef.current = false;
    // URL initialization intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync displayMode with pokemonGrouping.enabled
  useEffect(() => {
    if (!isFirstRenderRef.current) {
      const mode = viewOptions.displayMode.includes('trend') ? 'trend' : viewOptions.displayMode.includes('table') ? 'table' : 'cards';
      const isGrouped = pokemonGrouping.enabled;
      const newDisplayMode = `${mode}${isGrouped ? 'Grouped' : 'Ungrouped'}` as ViewOptions['displayMode'];
      
      if (newDisplayMode !== viewOptions.displayMode) {
        setViewOptions(prev => ({ ...prev, displayMode: newDisplayMode }));
      }
    }
  }, [pokemonGrouping.enabled, setViewOptions, viewOptions.displayMode]);

  // Sync URL when view options change
  useEffect(() => {
    if (!isFirstRenderRef.current) {
      const showTable = viewOptions.displayMode.includes('table') ? 'true' : 'false';
      const showTrendPoints = viewOptions.displayMode.includes('trend') ? 'true' : undefined;
      updateUrlParams({ 
        showTable,
        showListTable: showTable,
        showTrendPoints
      });
    }
  }, [viewOptions.displayMode]);

  const handleViewChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = e.target.value as 'cards' | 'table' | 'trend';
    const isGrouped = pokemonGrouping.enabled;
    const newDisplayMode = `${mode}${isGrouped ? 'Grouped' : 'Ungrouped'}` as ViewOptions['displayMode'];
    
    setViewOptions(prev => ({
      ...prev,
      displayMode: newDisplayMode
    }));
  };

  const currentView = viewOptions.displayMode.includes('trend') ? 'trend' : viewOptions.displayMode.includes('table') ? 'table' : 'cards';

  return (
    <div className="section-sidebar">
      <CollapsibleFieldset legend="View options" defaultCollapsed={true}>
        <div className="view-options-row">
          <label htmlFor="displayModeSelect">Display mode:</label>
          <select
            id="displayModeSelect"
            value={currentView}
            onChange={handleViewChange}
            className="view-options-select"
          >
            <option value="cards">Cards</option>
            <option value="table">Table</option>
            <option value="trend">Trend points</option>
          </select>
        </div>
        {currentView === 'trend' && <small className="trend-view-hint">Requests only the currently filtered cards.</small>}
        {currentView === 'trend' && (
          <div className="trend-scale-control">
            <span className="trend-scale-control__label">Eje X</span>
            <div className="trend-scale-switch" role="group" aria-label="Escala del eje horizontal">
              <button type="button" className={viewOptions.trendXAxisScale === 'normal' ? 'active' : ''} onClick={() => setViewOptions(prev => ({ ...prev, trendXAxisScale: 'normal' }))}>Normal</button>
              <button type="button" className={viewOptions.trendXAxisScale === 'sectors' ? 'active' : ''} onClick={() => setViewOptions(prev => ({ ...prev, trendXAxisScale: 'sectors' }))}>Sectores iguales</button>
            </div>
          </div>
        )}
      </CollapsibleFieldset>
    </div>
  );
};
