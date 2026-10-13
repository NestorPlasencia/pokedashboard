import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, ExternalLink, Loader2, Lock, Search, SlidersHorizontal, X } from "lucide-react";
import {
  PublicCollectionNotFound,
  loadPublicCollection,
  type PublicCollection,
} from "../../services/publicCollection";
import { pathForPublicCollection } from "../../utils/route";
import { COLLECTION_PRINTING_ORDER } from "../../services/inventory";
import { loadHierarchy } from "../../services/cards";
import { loadPublicCatalogImages, loadPublicMarketPrices, publicCollectionValue, publicMarketQuote, publicTcgplayerUrl, type PublicMarketSnapshot } from "../../utils/publicMarketPrices";
import {
  EMPTY_PUBLIC_COLLECTION_FILTERS,
  PUBLIC_COLLECTION_FACETS,
  PUBLIC_COLLECTION_ORDERS,
  publicCollectionFilterOptions,
  publicCollectionResults,
  type PublicCollectionOrder,
} from "../../utils/publicCollectionView";
import {
  PUBLIC_COLLECTION_TEXT,
  PUBLIC_LOCALES,
  publicLocaleFromSearch,
  withPublicLocale,
  type PublicCollectionText,
  type PublicLocale,
} from "../../utils/publicCollectionI18n";

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
  | { kind: "error" };

const cardKey = (card: PublicCollection["cards"][number]) =>
  JSON.stringify([card.product_id, card.printing, card.condition, card.language]);

export const PublicCollectionPage = ({ collectionId }: { collectionId: string }) => {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [locale, setLocale] = useState<PublicLocale>(() => publicLocaleFromSearch(window.location.search));
  const text = PUBLIC_COLLECTION_TEXT[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Replacing the entry keeps the chosen language in a copied link without filling history.
  const changeLocale = (next: PublicLocale) => {
    setLocale(next);
    window.history.replaceState(window.history.state, "", withPublicLocale(window.location.href, next));
  };
  const picker = <LocalePicker locale={locale} text={text} onChange={changeLocale} />;

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
        setStatus({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (status.kind === "loading") {
    return (
      <div className="public-collection">
        {picker}
        <p className="public-collection__notice" role="status">{text.loading}</p>
      </div>
    );
  }

  if (status.kind === "missing") {
    return (
      <div className="public-collection">
        {picker}
        <div className="public-collection__empty">
          <Lock size={22} aria-hidden="true" />
          <h1>{text.missingTitle}</h1>
          {/* A private collection and one that never existed give the same answer, so a
              shared id cannot be used to probe for which collections exist. */}
          <p>{text.missingBody}</p>
        </div>
      </div>
    );
  }

  if (status.kind === "error") {
    return (
      <div className="public-collection">
        {picker}
        <p className="public-collection__notice public-collection__notice--error" role="alert">
          {text.loadError}
        </p>
      </div>
    );
  }

  return <PublicCollectionExplorer key={collectionId} collection={status.collection} locale={locale} text={text} picker={picker} />;
};

const LocalePicker = ({ locale, text, onChange }: { locale: PublicLocale; text: PublicCollectionText; onChange: (locale: PublicLocale) => void }) => (
  <div className="public-collection__locale" role="group" aria-label={text.languageLabel}>
    {PUBLIC_LOCALES.map(option => (
      <button key={option} type="button" lang={option} aria-pressed={option === locale} onClick={() => onChange(option)}>
        {option.toUpperCase()}
      </button>
    ))}
  </div>
);

const PublicCollectionExplorer = ({ collection, locale, text, picker }: {
  collection: PublicCollection; locale: PublicLocale; text: PublicCollectionText; picker: ReactNode;
}) => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_PUBLIC_COLLECTION_FILTERS);
  const [order, setOrder] = useState<PublicCollectionOrder>('price-desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceState, setPriceState] = useState<{ kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; snapshot: PublicMarketSnapshot }>({ kind: 'loading' });
  const [priceAttempt, setPriceAttempt] = useState(0);
  const [catalogImages, setCatalogImages] = useState(() => new Map<PublicCollection['cards'][number], string>());
  useEffect(() => {
    if (!collection.cards.length) return;
    const controller = new AbortController();
    setPriceState({ kind: 'loading' });
    const timeout = window.setTimeout(() => controller.abort(), 5 * 60 * 1000);
    let cancelled = false;
    loadHierarchy().then(hierarchy => Promise.all([
      loadPublicMarketPrices(collection.cards, hierarchy, controller.signal)
        .then(snapshot => { if (!cancelled) setPriceState({ kind: 'ready', snapshot }); })
        .catch(() => { if (!cancelled) setPriceState({ kind: 'error' }); }),
      loadPublicCatalogImages(collection.cards, hierarchy, controller.signal)
        .then(images => { if (!cancelled) setCatalogImages(images); })
        .catch(() => {}),
    ]))
      .catch(() => { if (!cancelled) setPriceState({ kind: 'error' }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [collection.cards, priceAttempt]);
  const quotes = useMemo(() => new Map(collection.cards.map(card => [card, priceState.kind === 'ready' ? publicMarketQuote(card, priceState.snapshot.products[String(card.product_id)] ?? []) : null])), [collection.cards, priceState]);
  const prices = useMemo(() => new Map([...quotes].flatMap(([card, quote]) => quote ? [[card, quote.amount] as const] : [])), [quotes]);
  const filterOptions = useMemo(() => publicCollectionFilterOptions(collection.cards, COLLECTION_PRINTING_ORDER, text.notSpecified), [collection.cards, text]);
  const formatNumber = (value: number) => value.toLocaleString(text.intl);
  const marketMoney = useMemo(() => new Intl.NumberFormat(text.intl, { style: 'currency', currency: 'USD' }), [text]);
  const cards = useMemo(() => publicCollectionResults(collection.cards, search, filters, order, prices), [collection.cards, search, filters, order, prices]);
  const activeFilters = PUBLIC_COLLECTION_FACETS.filter(({ key }) => filters[key]).length;
  const totalCopies = collection.cards.reduce((sum, card) => sum + card.quantity, 0);
  const shownCopies = cards.reduce((sum, card) => sum + card.quantity, 0);
  const filtering = Boolean(search.trim()) || activeFilters > 0;
  // The status line announces loading; these placeholders only show where prices will go.
  const pricePlaceholder = <span className="public-collection__price-skeleton" aria-hidden="true" />;
  const formatValue = (shown: readonly PublicCollection['cards'][number][]) => {
    if (priceState.kind === 'loading') return pricePlaceholder;
    if (priceState.kind === 'error') return text.notAvailable;
    const { amount, unpriced } = publicCollectionValue(shown, prices);
    return unpriced ? `${marketMoney.format(amount)} (${text.unpriced(formatNumber(unpriced))})` : marketMoney.format(amount);
  };
  const clearFilters = () => { setSearch(''); setFilters(EMPTY_PUBLIC_COLLECTION_FILTERS); };

  return (
    <div className="public-collection">
      <header className="public-collection__header">
        <div className="public-collection__title-row">
          <h1>{collection.name}</h1>
          {picker}
        </div>
        <p className="public-collection__meta">
          <span>{text.cards(collection.cards.length, formatNumber)}</span>
          {totalCopies > collection.cards.length && (
            <span>{text.copies(totalCopies, formatNumber)}</span>
          )}
          {collection.cards.length > 0 && (
            <span className="public-collection__value">{text.value}: <strong>{formatValue(collection.cards)}</strong></span>
          )}
          {collection.printings.map((printing) => (
            <span key={printing} className="collection-printing-tag">{printing}</span>
          ))}
        </p>
      </header>

      {collection.subcollections.length > 0 && (
        <nav className="public-collection__subcollections" aria-label={text.subcollections}>
          {/* Publishing a collection does not publish its children, so only the ones
              shared in their own right are listed here. */}
          {collection.subcollections.map((subcollection) => (
            <a key={subcollection.id} href={withPublicLocale(pathForPublicCollection(subcollection.id), locale)}>
              {subcollection.name}
            </a>
          ))}
        </nav>
      )}

      {collection.cards.length === 0 ? (
        <p className="public-collection__notice">{text.empty}</p>
      ) : (
        <>
        <div className="public-collection__toolbar">
          <div className="public-collection__search">
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label={text.searchLabel} placeholder={text.searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)} />
            {search && <button type="button" aria-label={text.clearSearch} onClick={() => setSearch('')}><X size={16} aria-hidden="true" /></button>}
          </div>
          <button type="button" className={`public-collection__filter-toggle${activeFilters || filtersOpen ? ' is-active' : ''}`} aria-expanded={filtersOpen} aria-controls="public-collection-filters" onClick={() => setFiltersOpen(current => !current)}>
            <SlidersHorizontal size={18} aria-hidden="true" />
            {text.filters}{activeFilters ? ` (${activeFilters})` : ''}
          </button>
          <label className="public-collection__order">
            <ArrowUpDown size={18} aria-hidden="true" />
            <select aria-label={text.orderLabel} value={order} onChange={event => setOrder(event.target.value as PublicCollectionOrder)}>
              {PUBLIC_COLLECTION_ORDERS.map(option => <option key={option.value} value={option.value}>{text.orders[option.value]}</option>)}
            </select>
          </label>
        </div>
        <div id="public-collection-filters" className="public-collection__filters" hidden={!filtersOpen}>
          {PUBLIC_COLLECTION_FACETS.filter(({ key }) => filterOptions[key].length > 1).map(({ key }) => (
            <label key={key}>
              <span>{text.facets[key]}</span>
              <select value={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.target.value }))}>
                <option value="">{text.all}</option>
                {filterOptions[key].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        {/* Unfiltered, these totals would only repeat the header. */}
        <div className="public-collection__results" role="status">
          {filtering && <>
            <span>{text.results(formatNumber(cards.length), formatNumber(collection.cards.length), formatNumber(shownCopies))} · {text.value}: {formatValue(cards)}</span>
            <button type="button" onClick={clearFilters}>{text.clearAll}</button>
          </>}
        </div>
        <div className="public-collection__price-status" role="status">
          {priceState.kind === 'loading' && <span className="public-collection__price-loading"><Loader2 size={14} className="card-action-spinner" aria-hidden="true" />{text.pricesLoading}</span>}
          {priceState.kind === 'error' && <><span>{text.pricesError}</span><button type="button" onClick={() => setPriceAttempt(current => current + 1)}>{text.pricesRetry}</button></>}
          {priceState.kind === 'ready' && <>
            <span>{text.pricesSource} <time dateTime={priceState.snapshot.generatedAt}>{new Date(priceState.snapshot.generatedAt).toLocaleString(text.intl)}</time> · {text.pricesCache}</span>
            {(priceState.snapshot.partial || Date.now() - Date.parse(priceState.snapshot.generatedAt) > 24 * 60 * 60 * 1000) && <span>{text.pricesStale}</span>}
          </>}
        </div>
        {cards.length === 0 ? <p className="public-collection__notice">{text.noMatches}</p> : (
        <ul className="public-collection__cards">
          {cards.map((card) => {
            const quote = quotes.get(card);
            const image = catalogImages.get(card) || card.image_url;
            const tcgplayerUrl = publicTcgplayerUrl(card);
            const details = [card.set_name, card.number && `#${card.number}`, card.rarity].filter(Boolean).join(" · ");
            const variant = [card.printing, card.condition, card.language].filter(Boolean).join(" · ");
            return (
            <li key={cardKey(card)} className="public-collection__card">
              {image
                ? <img loading="lazy" src={image} alt={card.name} referrerPolicy="no-referrer" onLoad={event => {
                  if (!catalogImages.has(card) || event.currentTarget.naturalWidth > 1) return;
                  // The offline image worker can return a transparent one-pixel fallback.
                  setCatalogImages(current => { const next = new Map(current); next.delete(card); return next; });
                }} onError={() => {
                  if (!catalogImages.has(card)) return;
                  setCatalogImages(current => { const next = new Map(current); next.delete(card); return next; });
                }} />
                : <div className="public-collection__card-placeholder" aria-hidden="true" />}
              <div className="public-collection__card-info">
                <strong className="public-collection__card-line" title={card.name}>{card.name}</strong>
                <span className="public-collection__card-line" title={details}>{details}</span>
                <span className="public-collection__card-line" title={variant}>{variant}</span>
                <span className="public-collection__quantity">{text.quantity}: <strong>{formatNumber(card.quantity)}</strong></span>
                <span className="public-collection__market-price" title={quote ? text.marketTitle(quote.condition) : undefined}>
                  {text.market}: <strong>{quote ? marketMoney.format(quote.amount) : priceState.kind === 'loading' ? pricePlaceholder : text.notAvailable}</strong>
                  {tcgplayerUrl && (
                    <a className="public-collection__tcgplayer" href={tcgplayerUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
                      aria-label={text.viewOnTcgplayer(`${card.name}${card.printing ? ` (${card.printing})` : ''}`)}>
                      TCGplayer <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </span>
              </div>
            </li>
            );
          })}
        </ul>
        )}
        </>
      )}
    </div>
  );
};
