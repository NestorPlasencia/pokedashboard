import type { Card, ConditionKey, OptionsCollection } from '../types/dashboard';
import { excludeCardsByProperty, filterCardsByProperty } from './filters.ts';
import { countCopies } from './copyCount.ts';
import { collectionScopeNames } from './collectionTree.ts';
import { FILTER_PARAM_NAMES, excludeParam, type FilterParams } from './urlParams.ts';

export const REPORT_CONDITIONS: ConditionKey[] = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];
export const REPORT_FIELDS = [
  { key: 'series', label: 'Serie', property: 'setSeries' },
  { key: 'set', label: 'Expansión', property: 'setNames' },
  { key: 'rarity', label: 'Rareza', property: 'rarities' },
  { key: 'type', label: 'Tipo de carta', property: 'cardType' },
  { key: 'cardVariantTopLevel', label: 'Grupo de variante', property: 'cardVariantTopLevel' },
  { key: 'variants', label: 'Variante', property: 'variant' },
  { key: 'energy', label: 'Energía', property: 'types' },
  { key: 'subtypes', label: 'Subtipo', property: 'subtypes' },
  { key: 'artist', label: 'Artista', property: 'artist' },
  { key: 'pokedexRegion', label: 'Región Pokédex', property: 'pokedexRegion' },
] as const;

// Reports describe a whole group. Ownership/display/armed edit parameters never
// shrink that universe; selected collections are used only to partition it.
export const reportFilters = (input: FilterParams): FilterParams => {
  const result: FilterParams = {};
  for (const key of [...FILTER_PARAM_NAMES, ...FILTER_PARAM_NAMES.map(excludeParam), 'collections'] as const) {
    const value = input[key];
    if (Array.isArray(value)) result[key] = [...new Set(value.filter(item => typeof item === 'string' && item && item !== 'All'))];
  }
  for (const key of ['search', 'priceMin', 'priceMax'] as const) {
    if (typeof input[key] === 'string' && input[key]) result[key] = input[key];
  }
  return result;
};

export const filterReportCards = (cards: Card[], filters: FilterParams, condition: ConditionKey): Card[] => {
  let result = [...new Map(cards.map(card => [card.id, card])).values()];
  for (const field of REPORT_FIELDS) {
    const included = filters[field.key];
    if (included?.length) result = filterCardsByProperty(result, field.property, included);
    result = excludeCardsByProperty(result, field.property, filters[excludeParam(field.key)] ?? []);
  }
  const search = filters.search?.trim().toLocaleLowerCase();
  if (search) result = result.filter(card => [card.name, card.id, card.setName, card.number, ...card.setNames].join('\n').toLocaleLowerCase().includes(search));
  const minimum = filters.priceMin ? Number(filters.priceMin) : null;
  const maximum = filters.priceMax ? Number(filters.priceMax) : null;
  if (minimum !== null || maximum !== null) result = result.filter(card => {
    const price = card.prices[condition];
    return price != null && Number.isFinite(price) && (minimum === null || price >= minimum) && (maximum === null || price <= maximum);
  });
  return result;
};

export const partitionReportCards = (cards: Card[], names: string[], collections: OptionsCollection[]) => {
  const scope = names.length ? new Set(names.flatMap(name => collectionScopeNames(collections, name))) : null;
  const owned: Card[] = [], missing: Card[] = [];
  for (const card of cards) {
    const quantity = (card.collections ?? []).filter(entry => !scope || scope.has(entry.name))
      .reduce((sum, entry) => sum + countCopies(entry.quantity), 0);
    (quantity > 0 ? owned : missing).push(card);
  }
  return { total: cards, owned, missing };
};

export const reportValue = (cards: Card[], condition: ConditionKey) => cards.reduce((result, card) => {
  const price = card.prices[condition];
  if (price != null && Number.isFinite(price) && price >= 0) result.value += price;
  else result.unpriced++;
  return result;
}, { value: 0, unpriced: 0 });

/** Open the report's cards as trends, hiding the cards already owned. */
export const reportQuery = (filters: FilterParams, condition: ConditionKey, allCollectionNames: string[] = []): string => {
  const params = new URLSearchParams();
  // The catalog needs an explicit scope to apply Hide owned. Reports with an empty
  // scope use all inventory, so expand that choice to every available collection.
  const collections = filters.collections?.length ? filters.collections : allCollectionNames;
  for (const [key, value] of Object.entries(reportFilters({ ...filters, collections }))) {
    if (Array.isArray(value) && value.length) params.set(key, value.map(item => item.replace(/ /g, '_').replace(/&/g, 'and')).join('|'));
    else if (typeof value === 'string' && value) params.set(key, value.replace(/ /g, '_').replace(/&/g, 'and'));
  }
  params.set('conditions', condition.replace(/ /g, '_'));
  params.set('viewCollectionOption', 'hideOwned');
  params.set('showTrendPoints', 'true');
  return `?${params}`;
};
