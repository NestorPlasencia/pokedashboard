import { useCardContext } from "../../context/CardContext";
import { CollapsibleSection } from "../ui/CollapsibleSection";

export const ViewOptionsComponent = () => {
  const { viewOptions, setViewOptions } = useCardContext();

  return (
    <div className="section-sidebar">
      <CollapsibleSection title="View settings" defaultCollapsed={false}>
        <div className="view-options-print-columns">
            <strong>Table printing</strong>
            <small>Columns to include when printing a table:</small>
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
        <div className="trend-scale-control">
            <strong>Trend points</strong>
            <small className="trend-view-hint">Requests only the currently filtered cards.</small>
            <span className="trend-scale-control__label">X axis</span>
            <div className="trend-scale-switch" role="group" aria-label="Horizontal axis scale">
              <button type="button" className={viewOptions.trendXAxisScale === 'normal' ? 'active' : ''} onClick={() => setViewOptions(prev => ({ ...prev, trendXAxisScale: 'normal' }))}>Normal</button>
              <button type="button" className={viewOptions.trendXAxisScale === 'sectors' ? 'active' : ''} onClick={() => setViewOptions(prev => ({ ...prev, trendXAxisScale: 'sectors' }))}>Equal sectors</button>
            </div>
        </div>
        <div className="binder-settings">
          <strong>Binder</strong>
          <label htmlFor="binder-style">Binder style</label>
          <select
            id="binder-style"
            value={viewOptions.binderStyle}
            onChange={(event) => setViewOptions((current) => ({
              ...current,
              binderStyle: event.target.value as typeof current.binderStyle,
            }))}
          >
            <option value="twoPage">Two pages</option>
            <option value="ringed">Ringed · single page</option>
          </select>
          <label htmlFor="binder-page-color">Page color</label>
          <input
            id="binder-page-color"
            type="color"
            value={viewOptions.binderPageColor}
            onChange={(event) => setViewOptions((current) => ({ ...current, binderPageColor: event.target.value }))}
          />
          <label className="view-options-checkbox">
            <input
              type="checkbox"
              checked={viewOptions.binderSleeveColor === 'transparent'}
              onChange={(event) => setViewOptions((current) => ({
                ...current,
                binderSleeveColor: event.target.checked ? 'transparent' : '#d8e6f2',
              }))}
            />
            Transparent sleeves
          </label>
          {viewOptions.binderSleeveColor !== 'transparent' && <>
            <label htmlFor="binder-sleeve-color">Sleeve color</label>
            <input
              id="binder-sleeve-color"
              type="color"
              value={viewOptions.binderSleeveColor}
              onChange={(event) => setViewOptions((current) => ({ ...current, binderSleeveColor: event.target.value }))}
            />
          </>}
          <label htmlFor="binder-layout">Pocket layout (rows × columns)</label>
          <select
            id="binder-layout"
            value={viewOptions.binderLayout}
            onChange={(event) => setViewOptions((current) => ({
              ...current,
              binderLayout: event.target.value as typeof current.binderLayout,
            }))}
          >
            <option value="2x2">2 × 2</option>
            <option value="3x3">3 × 3</option>
            <option value="3x4">3 × 4 · Commercial</option>
            <option value="4x4">4 × 4</option>
          </select>
        </div>
      </CollapsibleSection>
    </div>
  );
};
