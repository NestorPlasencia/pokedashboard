import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Lock, Search, SlidersHorizontal, X } from "lucide-react";
import {
  PublicCollectionNotFound,
  loadPublicCollection,
  type PublicCollection,
} from "../../services/publicCollection";
import { pathForPublicCollection } from "../../utils/route";
import { COLLECTION_PRINTING_ORDER } from "../../services/inventory";
import {
  EMPTY_PUBLIC_COLLECTION_FILTERS,
  PUBLIC_COLLECTION_FACETS,
  PUBLIC_COLLECTION_ORDERS,
  publicCollectionFilterOptions,
  publicCollectionResults,
  type PublicCollectionOrder,
} from "../../utils/publicCollectionView";

/**
 * A collection someone shared, read without a session.
 *
 * Rendered outside every provider: nothing here depends on who is looking, and mounting
 * the signed-in tree would start a full inventory load for a page that never reads it.
 * The RPC returns only shareable fields, so there is nothing to strip on the way in.
 */

type Status =
  | { kind: "loading" }
  | { kind: "ready"; collection: PublicCollection }
  | { kind: "missing" }
  | { kind: "error"; message: string };

const cardKey = (card: PublicCollection["cards"][number]) =>
  JSON.stringify([card.product_id, card.printing, card.condition, card.language]);

export const PublicCollectionPage = ({ collectionId }: { collectionId: string }) => {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    loadPublicCollection(collectionId)
      .then((collection) => {
        if (!cancelled) setStatus({ kind: "ready", collection });
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof PublicCollectionNotFound) {
          setStatus({ kind: "missing" });
          return;
        }
        console.error("[public] Unable to read the shared collection", error);
        setStatus({ kind: "error", message: "This collection could not be loaded right now." });
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (status.kind === "loading") {
    return (
      <div className="public-collection">
        <p className="public-collection__notice" role="status">Loading the shared collection…</p>
      </div>
    );
  }

  if (status.kind === "missing") {
    return (
      <div className="public-collection">
        <div className="public-collection__empty">
          <Lock size={22} aria-hidden="true" />
          <h1>This collection is not available</h1>
          {/* A private collection and one that never existed give the same answer, so a
              shared id cannot be used to probe for which collections exist. */}
          <p>The link may be wrong, or its owner may have stopped sharing it.</p>
        </div>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="public-collection">
        <p className="public-collection__notice public-collection__notice--error" role="alert">
          {status.message}
        </p>
      </div>
    );
  }

  return <PublicCollectionExplorer key={collectionId} collection={status.collection} />;
};

const PublicCollectionExplorer = ({ collection }: { collection: PublicCollection }) => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_PUBLIC_COLLECTION_FILTERS);
  const [order, setOrder] = useState<PublicCollectionOrder>('name-asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterOptions = useMemo(() => publicCollectionFilterOptions(collection.cards, COLLECTION_PRINTING_ORDER), [collection.cards]);
  const cards = useMemo(() => publicCollectionResults(collection.cards, search, filters, order), [collection.cards, search, filters, order]);
  const activeFilters = PUBLIC_COLLECTION_FACETS.filter(({ key }) => filters[key]).length + (filters.quantity !== 'all' ? 1 : 0);
  const totalCopies = collection.cards.reduce((sum, card) => sum + card.quantity, 0);
  const shownCopies = cards.reduce((sum, card) => sum + card.quantity, 0);
  const clearFilters = () => { setSearch(''); setFilters(EMPTY_PUBLIC_COLLECTION_FILTERS); };

  return (
    <div className="public-collection">
      <header className="public-collection__header">
        <h1>{collection.name}</h1>
        <p className="public-collection__meta">
          <span>{collection.cards.length === 1 ? "1 card" : `${collection.cards.length.toLocaleString()} cards`}</span>
          {totalCopies > collection.cards.length && (
            <span>{totalCopies.toLocaleString()} copies</span>
          )}
          {collection.printings.map((printing) => (
            <span key={printing} className="collection-printing-tag">{printing}</span>
          ))}
        </p>
      </header>

      {collection.subcollections.length > 0 && (
        <nav className="public-collection__subcollections" aria-label="Shared subcollections">
          {/* Publishing a collection does not publish its children, so only the ones
              shared in their own right are listed here. */}
          {collection.subcollections.map((subcollection) => (
            <a key={subcollection.id} href={pathForPublicCollection(subcollection.id)}>
              {subcollection.name}
            </a>
          ))}
        </nav>
      )}

      {collection.cards.length === 0 ? (
        <p className="public-collection__notice">This collection has no cards yet.</p>
      ) : (
        <>
        <div className="public-collection__toolbar">
          <div className="public-collection__search">
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label="Buscar en la colección" placeholder="Buscar nombre, set o número…" value={search} onChange={event => setSearch(event.target.value)} />
            {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}><X size={16} aria-hidden="true" /></button>}
          </div>
          <button type="button" className={`public-collection__filter-toggle${activeFilters || filtersOpen ? ' is-active' : ''}`} aria-expanded={filtersOpen} aria-controls="public-collection-filters" onClick={() => setFiltersOpen(current => !current)}>
            <SlidersHorizontal size={18} aria-hidden="true" />
            Filtros{activeFilters ? ` (${activeFilters})` : ''}
          </button>
          <label className="public-collection__order">
            <ArrowUpDown size={18} aria-hidden="true" />
            <select aria-label="Ordenar cartas" value={order} onChange={event => setOrder(event.target.value as PublicCollectionOrder)}>
              {PUBLIC_COLLECTION_ORDERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div id="public-collection-filters" className="public-collection__filters" hidden={!filtersOpen}>
          {PUBLIC_COLLECTION_FACETS.filter(({ key }) => filterOptions[key].length > 1).map(({ key, label }) => (
            <label key={key}>
              <span>{label}</span>
              <select value={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.target.value }))}>
                <option value="">Todos</option>
                {filterOptions[key].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
          <label>
            <span>Quantity</span>
            <select value={filters.quantity} onChange={event => setFilters(current => ({ ...current, quantity: event.target.value as typeof current.quantity }))}>
              <option value="all">Todas las cantidades</option>
              <option value="single">Una copia</option>
              <option value="duplicates">Solo repetidas (2+)</option>
            </select>
          </label>
        </div>
        <div className="public-collection__results">
          <span role="status">{cards.length.toLocaleString()} de {collection.cards.length.toLocaleString()} cartas · {shownCopies.toLocaleString()} copias</span>
          {(search || activeFilters > 0) && <button type="button" onClick={clearFilters}>Limpiar búsqueda y filtros</button>}
        </div>
        {cards.length === 0 ? <p className="public-collection__notice">No hay cartas que coincidan con la búsqueda y los filtros.</p> : (
        <ul className="public-collection__cards">
          {cards.map((card) => (
            <li key={cardKey(card)} className="public-collection__card">
              {card.image_url
                ? <img loading="lazy" src={card.image_url} alt={card.name} />
                : <div className="public-collection__card-placeholder" aria-hidden="true" />}
              <div className="public-collection__card-info">
                <strong>{card.name}</strong>
                <span>
                  {[card.set_name, card.number && `#${card.number}`, card.rarity]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span>
                  {[card.printing, card.condition, card.language].filter(Boolean).join(" · ")}
                </span>
                <span className="public-collection__quantity">Quantity: <strong>{card.quantity.toLocaleString()}</strong></span>
              </div>
            </li>
          ))}
        </ul>
        )}
        </>
      )}
    </div>
  );
};
