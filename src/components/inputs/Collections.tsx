import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { useOptionsContext } from "../../context/OptionsContext";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { updateUrlParams } from "../../utils/urlParams";
import type { CollectionFilterOptions, ConditionKey } from "../../types/dashboard";
import { useAuth } from "../../context/AuthContext";
import { CATALOG_VIEW } from "../../utils/viewMode";
import { navigate } from "../../utils/route";
import { collectionScopeNames } from "../../utils/collectionTree";
import { countCopies } from "../../utils/copyCount";

const CONDITION_KEYS: ConditionKey[] = ["Near Mint", "Lightly Played", "Moderately Played", "Damaged", "Heavily Played"];

const MODE_LABELS: Record<CollectionFilterOptions["mode"], string> = {
  none: "",
  hideNotOwned: "Hide not owned",
  hideOwned: "Hide owned",
  shadowOwned: "Dim owned",
  shadowNotOwned: "Dim not owned",
};

export const Collections = () => {
  const { collections } = useOptionsContext();
  const { allCards, sortedCards, collectionFilter, setCollectionFilter, viewMode, setViewMode } = useCardContext();
  const { session, isAuthLoading } = useAuth();
  const [conditionMode, setConditionMode] = useState<'include' | 'exclude'>('include');
  const [conditionSearchVisible, setConditionSearchVisible] = useState(false);
  const [conditionSearch, setConditionSearch] = useState('');
  // Switching to a collection cannot leave a wishlist open: the mode replaces it.
  const viewedCollection = viewMode.kind === 'collection' ? viewMode.name : '';
  const isViewingCollection = viewMode.kind === 'collection';

  // Match Region's visible/total convention, but quantities here are physical copies.
  // The visible side follows every card filter except Condition itself; the total is the
  // complete viewed collection, including every nested subcollection.
  const conditionCounts = useMemo(() => {
    const empty = () => Object.fromEntries(
      CONDITION_KEYS.map(condition => [condition, 0])
    ) as Record<ConditionKey, number>;
    if (!isViewingCollection) return { visible: empty(), total: empty() };
    const scope = new Set(collectionScopeNames(collections, viewedCollection));
    const count = (cards: typeof allCards) => {
      const totals = empty();
      cards.forEach(card => card.collections?.forEach(entry => {
        if (!scope.has(entry.name)) return;
        CONDITION_KEYS.forEach(condition => {
          totals[condition] += countCopies(entry.quantity, [condition]);
        });
      }));
      return totals;
    };
    return { visible: count(sortedCards), total: count(allCards) };
  }, [allCards, collections, isViewingCollection, sortedCards, viewedCollection]);

  // Signing in lives on the Collections page, so a control that needs a session sends you
  // there instead of opening the sign-in dialog over the catalog.
  const requireSession = () => {
    if (session) return true;
    if (!isAuthLoading) navigate("collections");
    return false;
  };

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
      filterByCollections: collectionFilter.selectedCollections.length > 0 ? 'true' : 'false',
      viewCollectionOption: collectionFilter.mode,
      collections: collectionFilter.selectedCollections,
      limit: String(collectionFilter.limit),
      conditions: collectionFilter.conditionsFilter
    });
  }, [collectionFilter]);

  const handleCollectionsChange = (collection: string): void => {
    if (!requireSession()) return;
    setCollectionFilter(prev => {
      const selectedCollections = prev.selectedCollections.includes(collection)
        ? prev.selectedCollections.filter((candidate) => candidate !== collection)
        : [...prev.selectedCollections, collection];
      return {
        ...prev,
        enabled: selectedCollections.length > 0,
        selectedCollections,
      };
    });
  };

  const handleResetCollections = () => {
    setCollectionFilter(prev => ({
      ...prev,
      enabled: false,
      selectedCollections: [],
    }));
    updateUrlParams({ collections: [] });
  };

  // This uses the same include/exclude affordance as the catalog filters. The persisted
  // collection setting remains an inclusion list: an exclusion selection is stored as
  // the complement, while no condition selection is represented by All.
  const includedConditions = CONDITION_KEYS.filter(condition => collectionFilter.conditionsFilter.includes(condition));
  const conditionValuesForMode = conditionMode === 'include'
    ? (collectionFilter.conditionsFilter.includes('All') ? [] : includedConditions)
    : (collectionFilter.conditionsFilter.includes('All')
      ? []
      : CONDITION_KEYS.filter(condition => !includedConditions.includes(condition)));

  const setConditionValues = (values: ConditionKey[], mode = conditionMode) => {
    setCollectionFilter(prev => {
      if (mode === 'include') {
        return { ...prev, conditionsFilter: values.length > 0 ? values : ['All'] };
      }
      return {
        ...prev,
        conditionsFilter: values.length === 0
          ? ['All']
          : CONDITION_KEYS.filter(condition => !values.includes(condition)),
      };
    });
  };

  const toggleCondition = (condition: ConditionKey) => {
    const next = conditionValuesForMode.includes(condition)
      ? conditionValuesForMode.filter(value => value !== condition)
      : [...conditionValuesForMode, condition];
    setConditionValues(next);
  };

  // Shown while the panel is collapsed, so an active filter is never invisible.
  const summaryParts: string[] = [];
  if (collectionFilter.selectedCollections.length > 0) {
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

  // Nothing to filter by until there are collections. The component stays mounted either
  // way, so the effects above still switch the filter off on sign-out and keep the URL in
  // step - and a filter that is already on is never hidden.
  if (collections.length === 0 && collectionFilter.selectedCollections.length === 0) return null;
  const hasSelectedCollections = collectionFilter.selectedCollections.length > 0;

  return (
    <>
      <div className="section-sidebar">
        <CollapsibleSection
          title="Collections"
          defaultCollapsed={true}
          collapsedSummary={summaryParts.length > 0 && (
            <div className="filter-collapsed-summary">{summaryParts.join(" · ")}</div>
          )}
        >
          <p>Select collections:</p>
          {collections.length === 0 && (
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
              {/* The printings behind the collection, so its type is readable without
                  opening it - a hand-kept collection simply has none. */}
              {collection.printings.map((printing) => (
                <span key={printing} className="collection-printing-tag">{printing}</span>
              ))}
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

          {/* One row of controls: the panel is wide, so stacking them only added height. */}
          {hasSelectedCollections && (
            <div className="collections-filter-controls">
              <div className="collections-filter-field">
                <label htmlFor="filterByCollections">Show</label>
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
              </div>
              <div className="collections-filter-field">
                <label htmlFor="limitInput" title="Quantity required to count as owned">Owned at</label>
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
                  aria-label="Quantity required to count as owned"
                  className="collections-limit-input"
                />
              </div>
              <button onClick={handleResetCollections} type="button" className="collections-reset-btn">
                Clear selection
              </button>
            </div>
          )}
        </CollapsibleSection>
      </div>

      {isViewingCollection && (
        <div className="section-sidebar">
          <CollapsibleSection title="Condition" defaultCollapsed={false}>
            <div className="filter-panel-body">
              <div className="filter-toolbar">
                <div className="filter-segmented" role="group" aria-label="Condition selection mode">
                  <button
                    type="button"
                    className={conditionMode === 'include' ? 'active' : ''}
                    onClick={() => setConditionMode('include')}
                    aria-label="Include conditions"
                    title="Include conditions"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className={conditionMode === 'exclude' ? 'active' : ''}
                    onClick={() => setConditionMode('exclude')}
                    aria-label="Exclude conditions"
                    title="Exclude conditions"
                  >
                    ✕
                  </button>
                </div>

                <div className="filter-toolbar-actions">
                  <button
                    type="button"
                    className={`filter-icon-btn ${conditionSearchVisible ? 'active' : ''}`}
                    onClick={() => setConditionSearchVisible(visible => !visible)}
                    aria-label="Show or hide condition search"
                    title="Search"
                  >
                    🔍
                  </button>
                  <button
                    type="button"
                    className={`filter-icon-btn ${conditionValuesForMode.length === CONDITION_KEYS.length ? 'active' : ''}`}
                    onClick={() => setConditionValues(
                      conditionValuesForMode.length === CONDITION_KEYS.length ? [] : CONDITION_KEYS
                    )}
                    aria-label={conditionValuesForMode.length === CONDITION_KEYS.length ? 'Deselect all conditions' : 'Select all conditions'}
                    title={conditionValuesForMode.length === CONDITION_KEYS.length ? 'Deselect all' : 'Select all'}
                  >
                    ☑
                  </button>
                  <button
                    type="button"
                    className="filter-icon-btn danger"
                    onClick={() => setConditionValues([])}
                    aria-label="Clear condition filter"
                    title="Clear all"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {conditionValuesForMode.length > 0 && (
                <div className="filter-chip-groups">
                  {conditionValuesForMode.map(condition => (
                    <button
                      key={condition}
                      type="button"
                      className={`filter-chip ${conditionMode === 'include' ? 'include' : 'exclude'}`}
                      onClick={() => toggleCondition(condition)}
                      aria-label={`Remove ${condition}`}
                    >
                      {condition} <span>×</span>
                    </button>
                  ))}
                </div>
              )}

              {conditionSearchVisible && (
                <input
                  className="filter-search-input"
                  type="text"
                  value={conditionSearch}
                  onChange={event => setConditionSearch(event.target.value)}
                  placeholder="Search conditions..."
                  aria-label="Search conditions"
                />
              )}

              <div className="filter-options-list">
                {CONDITION_KEYS
                  .filter(condition => condition.toLowerCase().includes(conditionSearch.trim().toLowerCase()))
                  .map(condition => (
                    <label
                      key={condition}
                      className={`filter-option-item ${conditionValuesForMode.includes(condition)
                        ? (conditionMode === 'include' ? 'included' : 'excluded')
                        : 'neutral'}`}
                    >
                      <input
                        type="checkbox"
                        checked={conditionValuesForMode.includes(condition)}
                        onChange={() => toggleCondition(condition)}
                        aria-label={`Toggle ${condition} in ${conditionMode} mode`}
                      />
                      <span className="filter-option-item-label">{condition}</span>
                      <span className="filter-option-item-count" title="visible copies / total copies">
                        ({conditionCounts.visible[condition]}/{conditionCounts.total[condition]})
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          </CollapsibleSection>
        </div>
      )}
    </>
  );
};
