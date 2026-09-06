import { useEffect } from "react";
import { useCardContext } from "../../context/CardContext";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";
import { CollapsibleSection } from "../ui/CollapsibleSection";

export const OptionsView = () => {
  const { viewOptions, setViewOptions } = useCardContext();

  // Initialize from URL on component mount
  useEffect(() => {
    const params = parseUrlParams();
    
    // Handle displayMode from showTable and showListTable
    const showTable = params.showTable === 'true';
    const showListTable = params.showListTable === 'true';
    
    if (showListTable && !viewOptions.displayMode.includes('table')) {
      setViewOptions(prev => ({ 
        ...prev, 
        displayMode: prev.displayMode.includes('Grouped') ? 'tableGrouped' : 'tableUngrouped' 
      }));
    } else if (showTable && viewOptions.displayMode.includes('cards')) {
      setViewOptions(prev => ({ 
        ...prev, 
        displayMode: prev.displayMode.includes('Grouped') ? 'tableGrouped' : 'tableUngrouped' 
      }));
    }
    
  }, []); // Only run on mount

  return (
    <div className="section-sidebar">
      <CollapsibleSection title="View options" defaultCollapsed={false}>
        <label>
          <input
            type="checkbox"
            checked={viewOptions.displayMode.includes('table')}
            onChange={() => {
              const newValue = !viewOptions.displayMode.includes('table');
              setViewOptions(prev => ({ 
                ...prev, 
                displayMode: newValue 
                  ? (prev.displayMode === 'cardsGrouped' ? 'tableGrouped' : 'tableUngrouped')
                  : (prev.displayMode === 'tableGrouped' ? 'cardsGrouped' : 'cardsUngrouped')
              }));
              updateUrlParams({ showTable: newValue ? 'true' : 'false' });
            }}
            aria-label="Show table"
          />
          Show table
        </label>
        <label>
          <input
            type="checkbox"
            checked={viewOptions.displayMode.includes('table')}
            onChange={() => {
              const newValue = !viewOptions.displayMode.includes('table');
              setViewOptions(prev => ({ 
                ...prev, 
                displayMode: newValue 
                  ? (prev.displayMode === 'cardsGrouped' ? 'tableGrouped' : 'tableUngrouped')
                  : (prev.displayMode === 'tableGrouped' ? 'cardsGrouped' : 'cardsUngrouped')
              }));
              updateUrlParams({ showListTable: newValue ? 'true' : 'false' });
            }}
            aria-label="Show list as a table"
          />
          Show list as a table
        </label>
      </CollapsibleSection>
    </div>
  );
};
