import { useEffect } from "react";
import { useOptionsContext } from "../../context/OptionsContext";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams } from "../../utils/urlParams";
import type { CollectionFilterOptions, ConditionKey } from "../../types/dashboard";
import { useAuth } from "../../context/AuthContext";
import type { InventoryStatus } from "../../hooks/useLoadCards";

const CONDITION_KEYS: ConditionKey[] = ["Near Mint", "Lightly Played", "Moderately Played", "Damaged", "Heavily Played"];

const MODE_LABELS: Record<CollectionFilterOptions["mode"], string> = {
  none: "",
  hideNotOwned: "Hide not owned",
  hideOwned: "Hide owned",
  shadowOwned: "Dim owned",
  shadowNotOwned: "Dim not owned",
};

type CollectionsProps = {
  inventoryStatus: InventoryStatus;
  inventoryUpdatedAt: number | null;
};

export const Collections = ({
  inventoryStatus,
  inventoryUpdatedAt,
}: CollectionsProps) => {
  const { collections } = useOptionsContext();
  const { collectionFilter, setCollectionFilter } = useCardContext();
  const { session, isAuthLoading, refreshInventory, requestSignIn } = useAuth();

  const requireSession = () => {
    if (session) return true;
    if (!isAuthLoading) requestSignIn();
    return false;
  };

  const isInventoryLoading =
    inventoryStatus === "loading" || inventoryStatus === "refreshing";

  useEffect(() => {
    if (isAuthLoading || session) return;
    setCollectionFilter(prev => ({
      ...prev,
      enabled: false,
      selectedCollections: [],
      conditionsFilter: ["All"],
    }));
  }, [isAuthLoading, session, setCollectionFilter]);

  // Sync URL when collection filter changes
  useEffect(() => {
    updateUrlParams({ 
      filterByCollections: collectionFilter.enabled ? 'true' : 'false',
      viewCollectionOption: collectionFilter.mode,
      collections: collectionFilter.selectedCollections,
      limit: String(collectionFilter.limit),
      conditions: collectionFilter.conditionsFilter
    });
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

  // Shown while the panel is collapsed, so an active filter is never invisible.
  const summaryParts: string[] = [];
  if (collectionFilter.enabled) {
    const selected = collectionFilter.selectedCollections;
    summaryParts.push(
      selected.length === 0 ? "No collections selected"
        : selected.length <= 2 ? selected.join(", ")
          : `${selected.length} collections`
    );
    if (collectionFilter.mode !== "none") summaryParts.push(MODE_LABELS[collectionFilter.mode]);
    if (collectionFilter.limit !== 1) summaryParts.push(`min ${collectionFilter.limit}`);
    const conditions = collectionFilter.conditionsFilter;
    if (conditions.length > 0 && !conditions.includes("All")) {
      summaryParts.push(conditions.length <= 2 ? conditions.join(", ") : `${conditions.length} conditions`);
    }
  }

  return (
    <div className="section-sidebar">
      <CollapsibleFieldset
        legend="Collections"
        defaultCollapsed={true}
        collapsedSummary={summaryParts.length > 0 && (
          <div className="filter-collapsed-summary">{summaryParts.join(" · ")}</div>
        )}
      >
        <label>
          <input
            type="checkbox"
            value="ownedCards"
            checked={collectionFilter.enabled}
            onChange={() => {
              if (!requireSession()) return;
              setCollectionFilter(prev => ({
                ...prev,
                enabled: !prev.enabled
              }));
            }}
            aria-label="Enable collection filters"
          />
          Filter by collection
        </label>
        {collectionFilter.enabled && (
          <>
            <div className="collections-inventory-actions">
              <button
                type="button"
                onClick={refreshInventory}
                disabled={isInventoryLoading}
              >
                {inventoryStatus === "refreshing"
                  ? "Refreshing collections..."
                  : "Refresh collections"}
              </button>
              {inventoryStatus === "loading" && (
                <span role="status">Loading collections...</span>
              )}
              {inventoryStatus === "error" && (
                <span role="alert">Collections could not be loaded.</span>
              )}
              {inventoryStatus === "ready" && inventoryUpdatedAt && (
                <small>
                  Updated {new Date(inventoryUpdatedAt).toLocaleTimeString()}
                </small>
              )}
            </div>
            <select
              id="filterByCollections"
              value={collectionFilter.mode}
              onChange={(e) => {
                setCollectionFilter(prev => ({
                  ...prev,
                  mode: e.target.value as CollectionFilterOptions["mode"]
                }));
              }}
              aria-label="Select collection filter mode"
            >
              <option value="none">None</option>
              <option value="hideNotOwned">Hide not owned</option>
              <option value="hideOwned">Hide owned</option>
              <option value="shadowOwned">Dim owned</option>
              <option value="shadowNotOwned">Dim not owned</option>
            </select>
            <div className="collections-limit-row">
              <label htmlFor="limitInput">Quantity required to count as owned:</label>
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
              Clear collection selection
            </button>
            <p>Select collections:</p>
            {!isInventoryLoading && collections.length === 0 && (
              <span>No collections available</span>
            )}
            {collections.map((collection) => (
              <label key={collection.name} className="collections-checkbox-label">
                <input
                  type="checkbox"
                  value={collection.name}
                  checked={collectionFilter.selectedCollections.includes(collection.name)}
                  onChange={() => handleCollectionsChange(collection.name)}
                  aria-label={`Select collection ${collection.name}`}
                />
                <span>{collection.name}</span>
              </label>
            ))}
            {collectionFilter.selectedCollections.length > 0 && (
              <CollapsibleFieldset legend="Condition:" defaultCollapsed={false}>
                <label className="collections-checkbox-label">
                  <input
                    type="checkbox"
                    checked={collectionFilter.conditionsFilter.includes("All")}
                    onChange={handleConditionAll}
                    aria-label="All conditions"
                  />
                  <span>All</span>
                </label>
                {CONDITION_KEYS.map(condition => (
                  <label key={condition} className="collections-checkbox-label">
                    <input
                      type="checkbox"
                      checked={!collectionFilter.conditionsFilter.includes("All") && collectionFilter.conditionsFilter.includes(condition)}
                      onChange={() => handleConditionChange(condition)}
                      aria-label={`Filter by condition ${condition}`}
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
