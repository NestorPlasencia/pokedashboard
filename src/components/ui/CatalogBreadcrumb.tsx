import { ChevronRight, X } from "lucide-react";
import { useCardContext } from "../../context/CardContext";
import { toggleViewedCollection } from "../../utils/viewMode";

/**
 * Where the catalog is: [Catalog|one chip per collection being viewed] › series › set.
 *
 * Everything after the root is the same series/set selection whether you are browsing
 * the whole catalog or one or more collections, since a collection view still goes
 * through the Filters panel's series and set filters. Every step but the last is a way
 * back that widens the selection again: a collection chip drops just that collection
 * (returning to the catalog once none are left), the catalog's own root clears the
 * series, and the series step drops the set. The changes go through the Filters panel
 * like any other selection, so the sidebar and the URL follow.
 */
export function CatalogBreadcrumb() {
  const { seriesSelection, selectedSets, requestCatalogSelection, viewMode, setViewMode } = useCardContext();
  const { included, excluded } = seriesSelection;
  const hasSeries = included.length > 0 || excluded.length > 0;
  // A set can be chosen on its own - a collection view in particular rarely needs the
  // series narrowed first - so it earns its step whether or not one is selected.
  const hasSets = selectedSets.length > 0;
  const isCollection = viewMode.kind === "collection";
  const collectionNames = viewMode.kind === "collection" ? viewMode.names : [];

  const seriesLabel = included.length === 1 ? included[0]
    : included.length > 1 ? `${included.length} series`
      : `All series but ${excluded.length}`;
  const seriesTitle = included.length > 0 ? included.join(", ") : `Excluding ${excluded.join(", ")}`;
  const setLabel = selectedSets.length === 1 ? selectedSets[0] : `${selectedSets.length} sets`;

  // The catalog's own root only becomes a link once something narrows it, since
  // otherwise it is already where you are; a collection chip is always a way out.
  const catalogRootIsLink = hasSeries || hasSets;

  return (
    <nav className="catalog-breadcrumb" aria-label="Catalog location">
      <ol>
        {isCollection ? (
          collectionNames.map((name) => (
            <li key={name}>
              <button
                type="button"
                className="catalog-breadcrumb__step catalog-breadcrumb__step--collection"
                title={`Stop viewing ${name}`}
                onClick={() => setViewMode(toggleViewedCollection(viewMode, name))}
              >
                <span>{name}</span>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))
        ) : (
          <li>
            {catalogRootIsLink ? (
              <button
                type="button"
                className="catalog-breadcrumb__step"
                title="Back to every series"
                onClick={() => requestCatalogSelection({ series: { included: [], excluded: [] }, sets: [] })}
              >
                Catalog
              </button>
            ) : (
              <span className="catalog-breadcrumb__step is-current" aria-current="page">Catalog</span>
            )}
          </li>
        )}
        {hasSeries && (
          <li>
            <ChevronRight className="catalog-breadcrumb__separator" size={12} aria-hidden="true" />
            {hasSets ? (
              <button
                type="button"
                className="catalog-breadcrumb__step"
                title={`Every set in ${seriesTitle}`}
                onClick={() => requestCatalogSelection({ sets: [] })}
              >
                {seriesLabel}
              </button>
            ) : (
              <span className="catalog-breadcrumb__step is-current" aria-current="page" title={seriesTitle}>
                {seriesLabel}
              </span>
            )}
          </li>
        )}
        {hasSets && (
          <li>
            <ChevronRight className="catalog-breadcrumb__separator" size={12} aria-hidden="true" />
            <span className="catalog-breadcrumb__step is-current" aria-current="page" title={selectedSets.join(", ")}>
              {setLabel}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}
