import { useEffect } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams } from "../../utils/urlParams";
import { viewOptionsToParams } from "../../utils/urlState";
import type { ViewOptions } from "../../types/dashboard";

export const ViewOptionsComponent = () => {
  const { viewOptions, setViewOptions, pokemonGrouping } = useCardContext();

  // The initial values come from the URL in CardContext, so there is nothing to read
  // back here - only the grouping suffix, which follows the Pokémon grouping toggle.
  useEffect(() => {
    const mode = viewOptions.displayMode.includes('trend') ? 'trend' : viewOptions.displayMode.includes('table') ? 'table' : 'cards';
    const newDisplayMode = `${mode}${pokemonGrouping.enabled ? 'Grouped' : 'Ungrouped'}` as ViewOptions['displayMode'];

    if (newDisplayMode !== viewOptions.displayMode) {
      setViewOptions(prev => ({ ...prev, displayMode: newDisplayMode }));
    }
  }, [pokemonGrouping.enabled, setViewOptions, viewOptions.displayMode]);

  // Every view option is written back, including the print columns and the trend
  // controls, so a reload restores the same view. Defaults resolve to `undefined` and
  // leave the URL clean.
  useEffect(() => {
    updateUrlParams(viewOptionsToParams(viewOptions));
  }, [viewOptions]);

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
        {currentView === 'table' && (
          <div className="view-options-print-columns">
            <small>Columns to include when printing:</small>
            <label className="view-options-checkbox">
              <input
                type="checkbox"
                checked={viewOptions.printTableImages}
                onChange={(event) => setViewOptions(prev => ({
                  ...prev,
                  printTableImages: event.target.checked
                }))}
              />
              Images
            </label>
            <label className="view-options-checkbox">
              <input
                type="checkbox"
                checked={viewOptions.printTableQuantityMissing}
                onChange={(event) => setViewOptions(prev => ({
                  ...prev,
                  printTableQuantityMissing: event.target.checked
                }))}
              />
              Quantity and Missing
            </label>
            <label className="view-options-checkbox">
              <input
                type="checkbox"
                checked={viewOptions.printTableType}
                onChange={(event) => setViewOptions(prev => ({
                  ...prev,
                  printTableType: event.target.checked
                }))}
              />
              Type
            </label>
            <label className="view-options-checkbox">
              <input
                type="checkbox"
                checked={viewOptions.printTableVariant}
                onChange={(event) => setViewOptions(prev => ({
                  ...prev,
                  printTableVariant: event.target.checked
                }))}
              />
              Variant
            </label>
          </div>
        )}
        {currentView === 'trend' && <small className="trend-view-hint">Requests only the currently filtered cards.</small>}
        {currentView === 'trend' && (
          <div className="trend-scale-control">
            <span className="trend-scale-control__label">X axis</span>
            <div className="trend-scale-switch" role="group" aria-label="Horizontal axis scale">
              <button type="button" className={viewOptions.trendXAxisScale === 'normal' ? 'active' : ''} onClick={() => setViewOptions(prev => ({ ...prev, trendXAxisScale: 'normal' }))}>Normal</button>
              <button type="button" className={viewOptions.trendXAxisScale === 'sectors' ? 'active' : ''} onClick={() => setViewOptions(prev => ({ ...prev, trendXAxisScale: 'sectors' }))}>Equal sectors</button>
            </div>
          </div>
        )}
      </CollapsibleFieldset>
    </div>
  );
};
