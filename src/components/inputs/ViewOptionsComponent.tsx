import { useEffect, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";

export const ViewOptionsComponent = () => {
  const { viewOptions, setViewOptions, pokemonGrouping } = useCardContext();
  const isFirstRenderRef = useRef(true);

  // Initialize from URL on component mount
  useEffect(() => {
    const params = parseUrlParams();
    const showTable = params.showTable === 'true' || params.showListTable === 'true';
    
    if (showTable && !viewOptions.displayMode.includes('table')) {
      setViewOptions(prev => ({ 
        ...prev, 
        displayMode: 'tableUngrouped'
      }));
    }
    
    isFirstRenderRef.current = false;
  }, []); // Only run on mount

  // Sync displayMode with pokemonGrouping.enabled
  useEffect(() => {
    if (!isFirstRenderRef.current) {
      const isTable = viewOptions.displayMode.includes('table');
      const isGrouped = pokemonGrouping.enabled;
      const newDisplayMode = isGrouped
        ? (isTable ? 'tableGrouped' : 'cardsGrouped')
        : (isTable ? 'tableUngrouped' : 'cardsUngrouped');
      
      if (newDisplayMode !== viewOptions.displayMode) {
        setViewOptions(prev => ({ ...prev, displayMode: newDisplayMode }));
      }
    }
  }, [pokemonGrouping.enabled]);

  // Sync URL when view options change
  useEffect(() => {
    if (!isFirstRenderRef.current) {
      const showTable = viewOptions.displayMode.includes('table') ? 'true' : 'false';
      updateUrlParams({ 
        showTable,
        showListTable: showTable
      });
    }
  }, [viewOptions.displayMode]);

  const handleViewChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const isTable = e.target.value === 'table';
    const isGrouped = pokemonGrouping.enabled;
    const newDisplayMode = isGrouped
      ? (isTable ? 'tableGrouped' : 'cardsGrouped')
      : (isTable ? 'tableUngrouped' : 'cardsUngrouped');
    
    setViewOptions(prev => ({
      ...prev,
      displayMode: newDisplayMode
    }));
  };

  const currentView = viewOptions.displayMode.includes('table') ? 'table' : 'cards';

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
          </select>
        </div>
      </CollapsibleFieldset>
    </div>
  );
};
