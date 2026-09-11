import { ChevronRight } from "lucide-react";
import { useCardContext } from "../../context/CardContext";

/**
 * Where the catalog is: Catalog › series › set.
 *
 * Every step but the last is a way back that widens the selection again - Catalog returns
 * to the starting screen, the series drops the set. The changes go through the Filters
 * panel like any other selection, so the sidebar and the URL follow.
 */
export function CatalogBreadcrumb() {
  const { seriesSelection, selectedSets, requestCatalogSelection } = useCardContext();
  const { included, excluded } = seriesSelection;
  const hasSeries = included.length > 0 || excluded.length > 0;
  // A set chosen with no series shows nothing yet, so it only counts under a series.
  const hasSets = hasSeries && selectedSets.length > 0;

  const seriesLabel = included.length === 1 ? included[0]
    : included.length > 1 ? `${included.length} series`
      : `All series but ${excluded.length}`;
  const seriesTitle = included.length > 0 ? included.join(", ") : `Excluding ${excluded.join(", ")}`;
  const setLabel = selectedSets.length === 1 ? selectedSets[0] : `${selectedSets.length} sets`;

  return (
    <nav className="catalog-breadcrumb" aria-label="Catalog location">
      <ol>
        <li>
          {hasSeries ? (
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
