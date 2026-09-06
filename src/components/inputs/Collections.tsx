import { useEffect } from "react";
import { Eye } from "lucide-react";
import { useOptionsContext } from "../../context/OptionsContext";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { updateUrlParams } from "../../utils/urlParams";
import type { CollectionFilterOptions, ConditionKey } from "../../types/dashboard";
import { useAuth } from "../../context/AuthContext";
import { CATALOG_VIEW } from "../../utils/viewMode";
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
  const { collectionFilter, setCollectionFilter, viewMode, setViewMode } = useCardContext();
  const { session, isAuthLoading, refreshInventory, requestSignIn } = useAuth();
  // Switching to a collection cannot leave a wishlist open: the mode replaces it.
  const viewedCollection = viewMode.kind === 'collection' ? viewMode.name : '';

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
      <CollapsibleSection
        title="Collections"
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
              <div key={collection.name} className="collections-row">
                <label className="collections-checkbox-label">
                  <input
                    type="checkbox"
                    value={collection.name}
                    checked={collectionFilter.selectedCollections.includes(collection.name)}
                    onChange={() => handleCollectionsChange(collection.name)}
                    aria-label={`Select collection ${collection.name}`}
                  />
                  <span>{collection.name}</span>
                </label>
                <button
                  type="button"
                  className="collections-view-btn"
                  title="View collection"
                  aria-label={`View cards in ${collection.name}`}
                  onClick={() => setViewMode(
                    viewedCollection === collection.name ? CATALOG_VIEW : { kind: 'collection', name: collection.name }
                  )}
                  aria-pressed={viewedCollection === collection.name}
                >
                  <Eye size={13} aria-hidden="true" /> View
                </button>
              </div>
            ))}
            {collectionFilter.selectedCollections.length > 0 && (
              <CollapsibleSection title="Condition:" defaultCollapsed={false}>
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
              </CollapsibleSection>
            )}
          </>
        )}
      </CollapsibleSection>
    </div>
  );
};
