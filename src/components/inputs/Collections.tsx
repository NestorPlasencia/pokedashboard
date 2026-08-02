import { useEffect, useRef } from "react";
import { useOptionsContext } from "../../context/OptionsContext";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";
import type { ConditionKey } from "../../types/dashboard";

const CONDITION_KEYS: ConditionKey[] = ["Near Mint", "Lightly Played", "Moderately Played", "Damaged", "Heavily Played"];

export const Collections = () => {
  const { collections } = useOptionsContext();
  const { collectionFilter, setCollectionFilter } = useCardContext();

  // Track if this is the first render to avoid clearing collections on mount
  const isFirstRenderRef = useRef(true);

  // Initialize from URL on component mount
  useEffect(() => {
    const params = parseUrlParams();
    
    if (params.filterByCollections === 'true' && !collectionFilter.enabled) {
      setCollectionFilter(prev => ({ ...prev, enabled: true }));
    }
    
    if (params.viewCollectionOption && params.viewCollectionOption !== 'none' && collectionFilter.mode === 'none') {
      setCollectionFilter(prev => ({ 
        ...prev, 
        mode: params.viewCollectionOption as any 
      }));
    }
    
    // Initialize collections from URL
    if (params.collections && params.collections.length > 0 && collectionFilter.selectedCollections.length === 0) {
      setCollectionFilter(prev => ({ 
        ...prev, 
        selectedCollections: params.collections || []
      }));
    }
    
    // Initialize limit from URL
    if (params.limit && params.limit !== '1') {
      setCollectionFilter(prev => ({ 
        ...prev, 
        limit: Number(params.limit) 
      }));
    }

    // Initialize conditions from URL
    if (params.conditions && params.conditions.length > 0) {
      setCollectionFilter(prev => ({
        ...prev,
        conditionsFilter: params.conditions!
      }));
    }
    
    isFirstRenderRef.current = false;
  }, []); // Only run on mount

  // Sync URL when collection filter changes
  useEffect(() => {
    if (!isFirstRenderRef.current) {
      updateUrlParams({ 
        filterByCollections: collectionFilter.enabled ? 'true' : 'false',
        viewCollectionOption: collectionFilter.mode,
        collections: collectionFilter.selectedCollections,
        limit: String(collectionFilter.limit),
        conditions: collectionFilter.conditionsFilter
      });
    }
  }, [collectionFilter]);

  const handleCollectionsChange = (collection: string): void => {
    setCollectionFilter(prev => ({
      ...prev,
      selectedCollections: prev.selectedCollections.includes(collection)
        ? prev.selectedCollections.filter((c) => c !== collection)
        : [...prev.selectedCollections, collection]
    }));
  };

  const handleResetCollections = () => {
    setCollectionFilter(prev => ({
      ...prev,
      selectedCollections: [],
      conditionsFilter: ["All"]
    }));
    updateUrlParams({ collections: [], conditions: ["All"] });
  };

  const handleConditionChange = (condition: ConditionKey) => {
    setCollectionFilter(prev => {
      const current = prev.conditionsFilter.includes("All") ? [] : [...prev.conditionsFilter];
      const updated = current.includes(condition)
        ? current.filter(c => c !== condition)
        : [...current, condition];
      return { ...prev, conditionsFilter: updated.length === 0 ? ["All"] : updated };
    });
  };

  const handleConditionAll = () => {
    setCollectionFilter(prev => ({ ...prev, conditionsFilter: ["All"] }));
  };

  return (
    <div className="section-sidebar">
      <CollapsibleFieldset legend="Colecciones" defaultCollapsed={true}>
        <label>
          <input
            type="checkbox"
            value="ownedCards"
            checked={collectionFilter.enabled}
            onChange={() => {
              setCollectionFilter(prev => ({
                ...prev,
                enabled: !prev.enabled
              }));
            }}
            aria-label="Activar filtro por colecciones"
          />
          Filtrar por colecciones
        </label>
        {collectionFilter.enabled && (
          <>
            <select
              id="filterByCollections"
              value={collectionFilter.mode}
              onChange={(e) => {
                setCollectionFilter(prev => ({
                  ...prev,
                  mode: e.target.value as any
                }));
              }}
              aria-label="Seleccionar tipo de filtro de colección"
            >
              <option value="none">Ninguno</option>
              <option value="hideNotOwned">Ocultar no poseídas</option>
              <option value="hideOwned">Ocultar poseídas</option>
              <option value="shadowOwned">Sombrear poseídas</option>
              <option value="shadowNotOwned">Sombrear no poseídas</option>
            </select>
            <div className="collections-limit-row">
              <label htmlFor="limitInput">Límite para considerar poseída:</label>
              <input
                id="limitInput"
                type="number"
                min={1}
                value={collectionFilter.limit}
                onChange={e => {
                  setCollectionFilter(prev => ({
                    ...prev,
                    limit: Number(e.target.value)
                  }));
                }}
                className="collections-limit-input"
              />
            </div>
            <button onClick={handleResetCollections} type="button" className="collections-reset-btn">
              Limpiar selección de colecciones
            </button>
            <p>Selecciona colección:</p>
            {collections.length === 0 && <span>No hay colecciones disponibles</span>}
            {collections.map((collection) => (
              <label key={collection.name} className="collections-checkbox-label">
                <input
                  type="checkbox"
                  value={collection.name}
                  checked={collectionFilter.selectedCollections.includes(collection.name)}
                  onChange={() => handleCollectionsChange(collection.name)}
                  aria-label={`Seleccionar colección ${collection.name}`}
                />
                <span>{collection.name}</span>
              </label>
            ))}
            {collectionFilter.selectedCollections.length > 0 && (
              <CollapsibleFieldset legend="Condición:" defaultCollapsed={false}>
                <label className="collections-checkbox-label">
                  <input
                    type="checkbox"
                    checked={collectionFilter.conditionsFilter.includes("All")}
                    onChange={handleConditionAll}
                    aria-label="Todas las condiciones"
                  />
                  <span>All</span>
                </label>
                {CONDITION_KEYS.map(condition => (
                  <label key={condition} className="collections-checkbox-label">
                    <input
                      type="checkbox"
                      checked={!collectionFilter.conditionsFilter.includes("All") && collectionFilter.conditionsFilter.includes(condition)}
                      onChange={() => handleConditionChange(condition)}
                      aria-label={`Filtrar por condición ${condition}`}
                    />
                    <span>{condition}</span>
                  </label>
                ))}
              </CollapsibleFieldset>
            )}
          </>
        )}
      </CollapsibleFieldset>
    </div>
  );
};
