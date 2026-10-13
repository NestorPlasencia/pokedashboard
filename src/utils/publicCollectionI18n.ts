import type { PublicCollectionFacet, PublicCollectionOrder } from './publicCollectionView.ts';

/**
 * Interface language for a shared collection, chosen by `?lang=` so a link can be sent
 * already in the reader's language. Card data (rarity, printing, condition) keeps
 * TCGplayer's English names in both, since that is what the marketplace shows.
 */
export const PUBLIC_LOCALES = ['en', 'es'] as const;
export type PublicLocale = typeof PUBLIC_LOCALES[number];
export const DEFAULT_PUBLIC_LOCALE: PublicLocale = 'en';
const LANG_PARAM = 'lang';

export const publicLocaleFromSearch = (search: string): PublicLocale => {
  const value = new URLSearchParams(search).get(LANG_PARAM)?.trim().toLowerCase().slice(0, 2);
  return PUBLIC_LOCALES.find(locale => locale === value) ?? DEFAULT_PUBLIC_LOCALE;
};

/** The same address in another language; every other query parameter is kept. */
export const withPublicLocale = (href: string, locale: PublicLocale): string => {
  const url = new URL(href, 'http://local.invalid');
  url.searchParams.set(LANG_PARAM, locale);
  return `${url.pathname}${url.search}${url.hash}`;
};

const count = (one: string, many: string) => (value: number, format: (value: number) => string) =>
  value === 1 ? `1 ${one}` : `${format(value)} ${many}`;

const en = {
  intl: 'en-US',
  languageLabel: 'Language',
  loading: 'Loading the shared collection…',
  missingTitle: 'This collection is not available',
  missingBody: 'The link may be wrong, or its owner may have stopped sharing it.',
  loadError: 'This collection could not be loaded right now.',
  cards: count('card', 'cards'),
  copies: count('copy', 'copies'),
  subcollections: 'Shared subcollections',
  empty: 'This collection has no cards yet.',
  searchLabel: 'Search the collection',
  searchPlaceholder: 'Search name, set or number…',
  clearSearch: 'Clear search',
  filters: 'Filters',
  orderLabel: 'Sort cards',
  all: 'All',
  notSpecified: 'Not specified',
  results: (shown: string, total: string, copies: string) => `${shown} of ${total} cards · ${copies} copies`,
  value: 'Value',
  unpriced: (count: string) => `${count} without price`,
  clearAll: 'Clear search and filters',
  pricesLoading: 'Loading market prices…',
  pricesError: 'Market prices could not be loaded.',
  pricesRetry: 'Retry prices',
  pricesSource: 'TCGplayer market · USD · Updated',
  pricesCache: 'Cached for up to 24 h',
  pricesStale: 'Some prices may be incomplete or out of date.',
  noMatches: 'No cards match the search and filters.',
  quantity: 'Quantity',
  market: 'Market',
  notAvailable: 'N/A',
  marketTitle: (condition: string) => `Market · USD · ${condition}`,
  viewOnTcgplayer: (name: string) => `View ${name} on TCGplayer`,
  facets: { set_name: 'Set', rarity: 'Rarity', printing: 'Printing', condition: 'Condition', language: 'Language' } satisfies Record<PublicCollectionFacet, string>,
  orders: {
    'name-asc': 'Name A–Z', 'name-desc': 'Name Z–A', pokedex: 'Pokédex',
    'set-number': 'Set and number', rarity: 'Rarity', 'price-asc': 'Price ↑', 'price-desc': 'Price ↓',
  } satisfies Record<PublicCollectionOrder, string>,
};

export type PublicCollectionText = typeof en;

const es: PublicCollectionText = {
  intl: 'es-US',
  languageLabel: 'Idioma',
  loading: 'Cargando la colección compartida…',
  missingTitle: 'Esta colección no está disponible',
  missingBody: 'Puede que el enlace esté mal o que su dueño haya dejado de compartirla.',
  loadError: 'No se pudo cargar esta colección en este momento.',
  cards: count('carta', 'cartas'),
  copies: count('copia', 'copias'),
  subcollections: 'Subcolecciones compartidas',
  empty: 'Esta colección todavía no tiene cartas.',
  searchLabel: 'Buscar en la colección',
  searchPlaceholder: 'Buscar nombre, set o número…',
  clearSearch: 'Limpiar búsqueda',
  filters: 'Filtros',
  orderLabel: 'Ordenar cartas',
  all: 'Todos',
  notSpecified: 'Sin especificar',
  results: (shown, total, copies) => `${shown} de ${total} cartas · ${copies} copias`,
  value: 'Valor',
  unpriced: count => `${count} sin precio`,
  clearAll: 'Limpiar búsqueda y filtros',
  pricesLoading: 'Cargando precios de mercado…',
  pricesError: 'No se pudieron cargar los precios.',
  pricesRetry: 'Reintentar precios',
  pricesSource: 'Mercado TCGplayer · USD · Actualizado',
  pricesCache: 'Caché de hasta 24 h',
  pricesStale: 'Algunos precios pueden estar incompletos o desactualizados.',
  noMatches: 'No hay cartas que coincidan con la búsqueda y los filtros.',
  quantity: 'Cantidad',
  market: 'Mercado',
  notAvailable: 'N/D',
  marketTitle: condition => `Mercado · USD · ${condition}`,
  viewOnTcgplayer: name => `Ver ${name} en TCGplayer`,
  facets: { set_name: 'Set', rarity: 'Rareza', printing: 'Impresión', condition: 'Condición', language: 'Idioma' },
  orders: {
    'name-asc': 'Nombre A–Z', 'name-desc': 'Nombre Z–A', pokedex: 'Pokédex',
    'set-number': 'Set y número', rarity: 'Rareza', 'price-asc': 'Precio ↑', 'price-desc': 'Precio ↓',
  },
};

export const PUBLIC_COLLECTION_TEXT: Record<PublicLocale, PublicCollectionText> = { en, es };
