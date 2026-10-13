import type { PublicCollectionCard } from '../services/publicCollection';
import type { HierarchySerie, SourceCard } from '../types/source-card';

export type PublicMarketEntry = { printing: string; condition: string; marketPrice: number };
export type PublicMarketQuote = { amount: number; condition: string; reference: boolean };
export type PublicMarketSnapshot = {
  products: Record<string, PublicMarketEntry[]>;
  generatedAt: string;
  partial: boolean;
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const setKey = (value: string) => normalize(value).replace(/ base set$/, '');
const printingKey = (value: string) => normalize(value).replace(/holofoil/g, 'holo');
const CONDITIONS = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];

export function publicPriceSeries(cards: readonly PublicCollectionCard[], hierarchy: readonly HierarchySerie[]) {
  const sets = new Set(cards.map(card => setKey(card.set_name ?? '')).filter(Boolean));
  return [...new Set(hierarchy.filter(series => series.sets.some(set => sets.has(setKey(set.name)))).map(series => series.id))]
    .filter(id => Number.isSafeInteger(id) && id > 0).sort((a, b) => a - b);
}

/** Match a public market quote to this exact product, printing and condition. */
export function publicMarketQuote(card: PublicCollectionCard, entries: readonly PublicMarketEntry[]): PublicMarketQuote | null {
  if (card.language && !['english', 'en', 'eng'].includes(normalize(card.language))) return null;
  const condition = card.condition?.trim() || 'Near Mint';
  const wantedCondition = CONDITIONS.find(value => normalize(value) === normalize(condition));
  if (!wantedCondition) return null;
  const printings = new Set(entries.map(entry => printingKey(entry.printing)));
  // With an unspecified printing, a single available printing is unambiguous. Multiple
  // variants must never silently fall back to whichever happens to come first.
  const printing = card.printing?.trim() ? printingKey(card.printing) : printings.size === 1 ? [...printings][0] : null;
  if (!printing) return null;
  const match = entries.find(entry => printingKey(entry.printing) === printing &&
    normalize(entry.condition).startsWith(normalize(wantedCondition)) &&
    Number.isFinite(entry.marketPrice) && entry.marketPrice >= 0);
  return match ? { amount: match.marketPrice, condition: wantedCondition, reference: !card.condition?.trim() || !card.printing?.trim() } : null;
}

/** Market value of every copy, and how many card rows had no matching quote. */
export function publicCollectionValue(cards: readonly PublicCollectionCard[], prices: ReadonlyMap<PublicCollectionCard, number>) {
  let amount = 0, unpriced = 0;
  for (const card of cards) {
    const price = prices.get(card);
    if (price === undefined) unpriced++;
    else amount += price * card.quantity;
  }
  return { amount, unpriced };
}

/** TCGplayer product page preselecting this copy's printing, condition and language. */
export function publicTcgplayerUrl(card: PublicCollectionCard): string | null {
  if (!Number.isSafeInteger(card.product_id) || card.product_id <= 0) return null;
  const params = new URLSearchParams();
  const english = !card.language?.trim() || ['english', 'en', 'eng'].includes(normalize(card.language));
  if (english) params.set('Language', 'English');
  if (card.printing?.trim()) params.set('Printing', card.printing.trim());
  const condition = CONDITIONS.find(value => normalize(value) === normalize(card.condition ?? ''));
  if (condition) params.set('Condition', condition);
  const query = params.toString();
  return `https://www.tcgplayer.com/product/${card.product_id}${query ? `?${query}` : ''}`;
}

export function publicCatalogImage(card: PublicCollectionCard, source: readonly SourceCard[]): string | null {
  if (card.language && !['english', 'en', 'eng'].includes(normalize(card.language))) return null;
  const candidates = source.filter(candidate => candidate.tcgPlayerProductId === card.product_id &&
    typeof candidate.image === 'string' && /^https:\/\//i.test(candidate.image));
  const wanted = card.printing?.trim() ? printingKey(card.printing) : null;
  const matched = wanted ? candidates.filter(candidate => [candidate.printing?.name, candidate.cardVariant?.name]
    .some(value => typeof value === 'string' && printingKey(value) === wanted)) : [];
  const images = [...new Set((matched.length ? matched : candidates).map(candidate => candidate.image))];
  // A unique image can be shared by printings of the same product; different images
  // require an exact variant match rather than substituting another card's artwork.
  return images.length === 1 ? images[0] : null;
}

/** Lowest National Pokédex number among the product's Pokémon; none for Trainers and Energy. */
export function publicPokedexNumber(source: readonly SourceCard[]): number | null {
  const numbers = source.flatMap(candidate => (candidate.pokemonForms ?? []).map(form => form?.pokemonForm?.number))
    .filter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
  return numbers.length ? Math.min(...numbers) : null;
}

export type PublicCatalog = {
  images: Map<PublicCollectionCard, string>;
  pokedex: Map<PublicCollectionCard, number>;
};

/** Catalog artwork and Pokédex numbers, read from the same public per-series card lists. */
export async function loadPublicCatalog(
  cards: readonly PublicCollectionCard[], hierarchy: readonly HierarchySerie[], signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<PublicCatalog> {
  const result: PublicCatalog = { images: new Map(), pokedex: new Map() };
  for (const id of publicPriceSeries(cards, hierarchy)) {
    signal?.throwIfAborted();
    try {
      const response = await request(`/api/poke-db/cards?seriesId=${id}`, { credentials: 'omit', signal, headers: { Accept: 'application/json' } });
      if (!response.ok) continue;
      const source = await response.json();
      if (!Array.isArray(source.items)) continue;
      const byProduct = new Map<number, SourceCard[]>();
      for (const candidate of source.items) {
        if (!candidate || typeof candidate.tcgPlayerProductId !== 'number') continue;
        const group = byProduct.get(candidate.tcgPlayerProductId) ?? [];
        group.push(candidate);
        byProduct.set(candidate.tcgPlayerProductId, group);
      }
      for (const card of cards) {
        const source = byProduct.get(card.product_id) ?? [];
        const image = publicCatalogImage(card, source);
        if (image) result.images.set(card, image);
        const pokedex = publicPokedexNumber(source);
        if (pokedex !== null) result.pokedex.set(card, pokedex);
      }
    } catch (error) { if (signal?.aborted) throw error; }
  }
  return result;
}

/** Only public series IDs go to Vercel. No collection UUID, owner, quantities or auth. */
export async function loadPublicMarketPrices(
  cards: readonly PublicCollectionCard[], hierarchy: readonly HierarchySerie[], signal?: AbortSignal,
  request: typeof fetch = fetch,
): Promise<PublicMarketSnapshot> {
  const series = publicPriceSeries(cards, hierarchy);
  if (!series.length) throw new Error('No se encontraron las series de esta colección.');
  const productIds = new Set(cards.map(card => String(card.product_id)));
  const products: PublicMarketSnapshot['products'] = {};
  const dates: string[] = [];
  let failures = 0;
  // Sequential series requests reuse the API's cache and avoid concurrent cold refreshes.
  for (const id of series) {
    signal?.throwIfAborted();
    try {
      const response = await request(`/api/prices?seriesId=${id}`, {
        credentials: 'omit', cache: 'no-cache', signal, headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Prices unavailable');
      const bundle = await response.json();
      if (!Number.isFinite(Date.parse(bundle.generatedAt)) || !bundle.products || typeof bundle.products !== 'object') throw new Error('Invalid prices');
      dates.push(bundle.generatedAt);
      for (const [productId, values] of Object.entries(bundle.products)) {
        if (!productIds.has(productId) || !Array.isArray(values)) continue;
        products[productId] = values.filter(value => value && typeof value.printing === 'string' &&
          typeof value.condition === 'string' && typeof value.marketPrice === 'number' &&
          Number.isFinite(value.marketPrice) && value.marketPrice >= 0)
          .map(({ printing, condition, marketPrice }) => ({ printing, condition, marketPrice }));
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      failures++;
    }
  }
  if (!dates.length) throw new Error('No se pudieron cargar los precios de mercado.');
  return { products, generatedAt: dates.sort((a, b) => Date.parse(a) - Date.parse(b))[0], partial: failures > 0 };
}
