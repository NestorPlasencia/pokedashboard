import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { useOptionsContext } from "../../context/OptionsContext";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { updateUrlParams } from "../../utils/urlParams";
import type { CollectionFilterOptions, ConditionKey } from "../../types/dashboard";
import { useAuth } from "../../context/AuthContext";
import { toggleViewedCollection } from "../../utils/viewMode";
import { navigate } from "../../utils/route";
import { childrenByParent, collectionScopeNames } from "../../utils/collectionTree";
import { groupByTag } from "../../utils/collectionTags";
import { countCopies } from "../../utils/copyCount";

const CONDITION_KEYS: ConditionKey[] = ["Near Mint", "Lightly Played", "Moderately Played", "Damaged", "Heavily Played"];
// A stable reference outside a collection view, so it never looks like a changed
// dependency to the hooks that read it.
const NO_VIEWED_COLLECTIONS: string[] = [];

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
  // Switching to a collection cannot leave a wishlist open: the mode replaces it. Several
  // can be viewed together, so this is every one currently active rather than just one.
  const viewedCollections = viewMode.kind === 'collection' ? viewMode.names : NO_VIEWED_COLLECTIONS;
  const isViewingCollection = viewMode.kind === 'collection';

  const childrenOf = useMemo(() => childrenByParent(collections), [collections]);
  // A collection whose parent is not in the list - a name the snapshot reported before the
  // row itself arrived - would otherwise be drawn nowhere, so it surfaces at the root
  // rather than disappearing from the filter entirely.
  const rootCollections = useMemo(() => {
    const ids = new Set(collections.map((collection) => collection.id).filter(Boolean));
    return collections.filter((collection) => !collection.parentId || !ids.has(collection.parentId));
  }, [collections]);

  // Match Region's visible/total convention, but quantities here are physical copies.
  // The visible side follows every card filter except Condition itself; the total is the
  // union of every viewed collection, each including its own nested subcollections.
  const conditionCounts = useMemo(() => {
    const empty = () => Object.fromEntries(
      CONDITION_KEYS.map(condition => [condition, 0])
    ) as Record<ConditionKey, number>;
    if (!isViewingCollection) return { visible: empty(), total: empty() };
    const scope = new Set(viewedCollections.flatMap((name) => collectionScopeNames(collections, name)));
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
  }, [allCards, collections, isViewingCollection, sortedCards, viewedCollections]);

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

  // Drawn as the tree it is: a subcollection belongs to its parent, and ticking the
  // parent covers it, so a flat list misrepresented both.
  const renderCollectionRow = (collection: typeof collections[number], depth: number) => {
    const children = collection.id ? childrenOf.get(collection.id) ?? [] : [];
    const isViewed = viewedCollections.includes(collection.name);
    return (
      <div key={collection.id || collection.name}>
        <div
          className={`collections-row${depth > 0 ? ' collections-row--nested' : ''}`}
          style={depth > 0 ? { marginLeft: depth * 10, paddingLeft: 6 } : undefined}
        >
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
            title={isViewed ? "Stop viewing this collection" : "Add this collection to the view"}
            aria-label={`${isViewed ? "Stop viewing" : "View"} cards in ${collection.name}`}
            onClick={() => setViewMode(toggleViewedCollection(viewMode, collection.name))}
            aria-pressed={isViewed}
          >
            <Eye size={13} aria-hidden="true" /> View
          </button>
        </div>
        {children.map((child) => renderCollectionRow(child, depth + 1))}
      </div>
    );
  };

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
          {/* One folding section per tag, each holding whole trees: a subcollection is
              drawn under its parent rather than sorted into a section of its own, so the
              split by tag never breaks the nesting apart. An empty section is left out
              instead of shown as a heading with nothing under it. */}
          {groupByTag(rootCollections)
            // The three schema tags are always drawn, empty or not: they are the
            // separation this list is read by, and a heading that vanished when its last
            // collection was untagged would make the panel reshuffle under you. Untagged
            // is not one of them, so it appears only once something has fallen into it.
            .filter((section) => section.tag !== null || section.items.length > 0)
            .map((section) => (
              <CollapsibleSection
                key={section.label}
                title={`${section.label} (${section.items.length})`}
                persistKey={`collections-tag-${section.tag ?? 'untagged'}`}
              >
                {section.items.length > 0
                  ? section.items.map((collection) => renderCollectionRow(collection, 0))
                  : <small>No collections with this tag.</small>}
              </CollapsibleSection>
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
