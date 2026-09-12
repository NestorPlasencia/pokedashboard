import { useEffect, useState } from "react";
import { Eye, Lock } from "lucide-react";
import { loadHierarchy } from "../../services/cards";
import { useCardContext } from "../../context/CardContext";
import { useOptionsContext } from "../../context/OptionsContext";
import { useAuth } from "../../context/AuthContext";
import { groupHierarchyForBrowsing, type BrowsableHierarchy } from "../../utils/hierarchy";
import { toggleViewedCollection } from "../../utils/viewMode";
import { childrenByParent } from "../../utils/collectionTree";
import type { HierarchySerie } from "../../types/source-card";
import type { OptionsCollection } from "../../types/dashboard";

/**
 * What the catalog shows before a series is chosen: every series and its sets, newest
 * first, so the first screen is a map of the catalog rather than an instruction to go
 * find the filter panel. Signed in, your own collections follow below it - the same
 * quick-browse shortcut the Collections page offers, without leaving the catalog.
 *
 * Nothing here holds a selection. Picking a series, a set or a collection is a request
 * the owning panel applies, because that panel owns the selection and writes it to the URL.
 */
export function SeriesStarter() {
  const { requestCatalogSelection, setViewMode, viewMode } = useCardContext();
  const { collections } = useOptionsContext();
  const { session } = useAuth();
  const [hierarchy, setHierarchy] = useState<BrowsableHierarchy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The same cached request the loader and the Filters panel make, so this costs nothing
    // extra once the catalog has started.
    loadHierarchy()
      .then((loaded) => { if (!cancelled) setHierarchy(groupHierarchyForBrowsing(loaded)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return (
      <p className="series-starter__status" role="alert">
        The list of series could not be loaded. Open the Filters panel to choose one.
      </p>
    );
  }
  if (!hierarchy) {
    return <p className="series-starter__status" role="status">Loading series…</p>;
  }

  const renderSerie = (serie: HierarchySerie, open: boolean) => (
    <details key={serie.id} className="series-starter__serie" open={open}>
      <summary>
        <span className="series-starter__serie-name">{serie.name}</span>
        <span className="series-starter__count">
          {serie.sets.length} {serie.sets.length === 1 ? "set" : "sets"}
        </span>
      </summary>
      <div className="series-starter__body">
        <button
          type="button"
          className="series-starter__all"
          onClick={() => requestCatalogSelection({ series: { included: [serie.name], excluded: [] }, sets: [] })}
        >
          Load all of {serie.name}
        </button>
        <ul className="series-starter__sets">
          {serie.sets.map((set) => (
            <li key={`${set.id}-${set.name}`}>
              <button
                type="button"
                className="series-starter__set"
                onClick={() => requestCatalogSelection({ series: { included: [serie.name], excluded: [] }, sets: [set.name] })}
              >
                {set.symbolImage
                  ? <img src={set.symbolImage} alt="" loading="lazy" />
                  : <span className="series-starter__symbol-placeholder" aria-hidden="true" />}
                <span>{set.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );

  // Own collections and whatever synced in from Collectr, nested under their parents -
  // the same tree the Collections page manages, here just to jump into one.
  const childrenOf = childrenByParent(collections);
  const ownedRoots = collections.filter((collection) => collection.parentId === null && collection.kind === "owned");

  const renderCollection = (collection: OptionsCollection, depth: number) => {
    const children = collection.id ? childrenOf.get(collection.id) ?? [] : [];
    return (
      <li key={collection.id || collection.name}>
        <button
          type="button"
          className="series-starter__collection"
          style={depth > 0 ? { marginLeft: depth * 18 } : undefined}
          onClick={() => setViewMode(toggleViewedCollection(viewMode, collection.name))}
        >
          <Eye size={14} aria-hidden="true" />
          <span>{collection.name}</span>
          {!collection.editable && <Lock size={12} aria-label="Read-only" />}
        </button>
        {children.length > 0 && (
          <ul className="series-starter__collections-list">
            {children.map((child) => renderCollection(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="series-starter">
      <div className="series-starter__intro">
        <p className="series-starter__title">Choose a series or a set to start exploring cards.</p>
        <p className="series-starter__hint">Newest first. To combine several series, use the Filters panel.</p>
      </div>
      {/* Only the newest era starts open: it is where most visits begin, and the rest of the
          catalog stays one click away without turning the first screen into hundreds of sets. */}
      {hierarchy.eras.map((serie, index) => renderSerie(serie, index === 0))}
      {hierarchy.special.length > 0 && (
        <>
          <h2 className="series-starter__heading">Special releases</h2>
          {hierarchy.special.map((serie) => renderSerie(serie, false))}
        </>
      )}
      {session && ownedRoots.length > 0 && (
        <>
          <h2 className="series-starter__heading">Your collections</h2>
          <ul className="series-starter__collections-list">
            {ownedRoots.map((collection) => renderCollection(collection, 0))}
          </ul>
        </>
      )}
    </div>
  );
}
