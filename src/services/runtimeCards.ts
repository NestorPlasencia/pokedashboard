import { COLLECTIONS } from "../constants/constants";
import type { Card, ConditionKey } from "../types/dashboard";
import type {
  CollectorCard,
  PriceEntry,
  SourceCard,
  SourceCardsFile,
} from "../types/source-card";

type ConditionsEntry = {
  id: string;
  collection: string;
  conditions: Partial<Record<ConditionKey, number>>;
};
type ConditionsMap = Map<
  string,
  Map<string, Partial<Record<ConditionKey, number>>>
>;
type CollectionIndexEntry = { collectionName: string; card: CollectorCard };
type PriceCacheMetadata = {
  version: 3;
  seriesId: number;
  expiresAt: number;
};
type RuntimePriceEntry = Pick<
  PriceEntry,
  "condition" | "marketPrice" | "printing"
>;
type PriceBundle = {
  generatedAt: string;
  setCount: number;
  products: Record<string, RuntimePriceEntry[]>;
};
type AllPricesSnapshot = {
  expiresAt: number;
  priceMap: Map<number, RuntimePriceEntry[]>;
  setCount: number;
};

export type RuntimeCardsResult = {
  items: Card[];
  meta: {
    seriesId: number;
    sourceCards: number;
    generatedCards: number;
    priceSets: number;
    priceProducts: number;
    priceCacheExpiresAt: string;
    generatedAt: string;
  };
};

const pokeDbDeploymentUrl =
  "https://poke-db-git-master-nestorplasencias-projects.vercel.app";
const pokeDbApiBaseUrl =
  import.meta.env.VITE_POKE_DB_API_BASE_URL ||
  (import.meta.env.DEV ? "/poke-db-api" : `${pokeDbDeploymentUrl}/api`);
const priceCacheName = "pokedashboard-tcg-prices-v3";
const priceTtlMs = 24 * 60 * 60 * 1000;
const seriesTtlMs = 15 * 60 * 1000;

const pricesBySeries = new Map<number, AllPricesSnapshot>();
const pendingPricesBySeries = new Map<number, Promise<AllPricesSnapshot>>();
let collectionIndexPromise: Promise<Map<number, CollectionIndexEntry[]>> | null = null;
let conditionsPromise: Promise<ConditionsMap> | null = null;
const seriesCache = new Map<
  number,
  { expiresAt: number; result: RuntimeCardsResult }
>();
const pendingSeries = new Map<number, Promise<RuntimeCardsResult>>();

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const fetchJson = async <T>(
  url: string,
  timeoutMilliseconds = 20_000
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
      if (response.ok) return (await response.json()) as T;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`${url} returned ${response.status}`);
      }
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await wait(500 * 2 ** attempt);
  }
  throw lastError;
};

const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await task(values[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker)
  );
  return results;
};

const cacheUrl = (key: string) =>
  new URL(`/__pokedashboard_cache__/${key}`, window.location.origin).toString();

const openPriceCache = async (): Promise<Cache | null> => {
  if (!("caches" in window)) return null;
  await window.caches.delete("pokereg-tcg-prices-v1");
  await window.caches.delete("pokereg-tcg-prices-v2");
  return window.caches.open(priceCacheName);
};

const readCachedJson = async <T>(cache: Cache, key: string): Promise<T | null> => {
  const response = await cache.match(cacheUrl(key));
  return response ? ((await response.json()) as T) : null;
};

const writeCachedJson = async (
  cache: Cache,
  key: string,
  value: unknown
): Promise<void> => {
  await cache.put(
    cacheUrl(key),
    new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json" },
    })
  );
};

const getPriceExpiration = (bundle: PriceBundle): number => {
  const generatedAt = Date.parse(bundle.generatedAt);
  const sourceExpiration = Number.isFinite(generatedAt)
    ? generatedAt + priceTtlMs
    : Date.now() + priceTtlMs;
  return Math.min(Date.now() + priceTtlMs, sourceExpiration);
};

const fetchAndCachePrices = async (cache: Cache | null, seriesId: number) => {
  const bundle = await fetchJson<PriceBundle>(
    new URL(`/api/prices?seriesId=${seriesId}`, window.location.origin).toString(),
    10 * 60 * 1000
  );
  const metadata: PriceCacheMetadata = {
    version: 3,
    seriesId,
    expiresAt: getPriceExpiration(bundle),
  };
  if (cache) {
    await writeCachedJson(cache, `bundle-${seriesId}`, bundle);
    await writeCachedJson(cache, `metadata-${seriesId}`, metadata);
  }
  return { metadata, bundle };
};

const buildPriceSnapshot = (
  metadata: PriceCacheMetadata,
  bundle: PriceBundle
): AllPricesSnapshot => {
  const priceMap = new Map<number, RuntimePriceEntry[]>();
  for (const [productId, prices] of Object.entries(bundle.products)) {
    priceMap.set(Number(productId), prices);
  }
  return {
    expiresAt: metadata.expiresAt,
    priceMap,
    setCount: bundle.setCount,
  };
};

const loadPricesForSeries = async (
  seriesId: number
): Promise<AllPricesSnapshot> => {
  const current = pricesBySeries.get(seriesId);
  if (current && current.expiresAt > Date.now()) {
    return current;
  }
  const pending = pendingPricesBySeries.get(seriesId);
  if (pending) return pending;

  const request = (async () => {
    const cache = await openPriceCache();
    const metadata = cache
      ? await readCachedJson<PriceCacheMetadata>(cache, `metadata-${seriesId}`)
      : null;
    if (
      cache &&
      metadata?.version === 3 &&
      metadata.seriesId === seriesId &&
      metadata.expiresAt > Date.now()
    ) {
      const bundle = await readCachedJson<PriceBundle>(cache, `bundle-${seriesId}`);
      if (bundle) return buildPriceSnapshot(metadata, bundle);
    }

    const refreshed = await fetchAndCachePrices(cache, seriesId);
    return buildPriceSnapshot(refreshed.metadata, refreshed.bundle);
  })()
    .then((snapshot) => {
      pricesBySeries.set(seriesId, snapshot);
      return snapshot;
    })
    .finally(() => {
      pendingPricesBySeries.delete(seriesId);
    });
  pendingPricesBySeries.set(seriesId, request);
  return request;
};

const extractCondition = (condition: string): ConditionKey | null => {
  if (condition.includes("Near Mint")) return "Near Mint";
  if (condition.includes("Lightly Played")) return "Lightly Played";
  if (condition.includes("Moderately Played")) return "Moderately Played";
  if (condition.includes("Heavily Played")) return "Heavily Played";
  if (condition.includes("Damaged")) return "Damaged";
  return null;
};

const createDashboardCard = (
  sourceCard: SourceCard,
  priceMap: Map<number, RuntimePriceEntry[]>
): Card | null => {
  if (!sourceCard.sets || sourceCard.sets.length === 0) return null;
  const sourceSets = sourceCard.sets.map((entry) => entry.set);
  const primarySet = sourceSets[0];
  const variant = sourceCard.cardVariant?.name || "Normal";
  const printing = sourceCard.printing?.name || "";
  const card: Card = {
    id: String(sourceCard.id),
    productId: sourceCard.tcgPlayerProductId,
    name: sourceCard.name,
    types: (sourceCard.energyTypes || []).map((entry) => entry.energyType.name),
    number: sourceCard.number,
    artist: sourceCard.illustrator?.name || "",
    subtypes: (sourceCard.subtypes || []).map((entry) => entry.subtype.name),
    supertype: sourceCard.supertype?.name || "",
    nationalPokedexNumbers: (sourceCard.pokemonForms || []).map(
      (entry) => entry.pokemonForm.number
    ),
    pokemonForms: (sourceCard.pokemonForms || []).map(
      (entry) => entry.pokemonForm.name
    ),
    image: sourceCard.image || "",
    rarity:
      (sourceCard.rarities || []).map((entry) => entry.rarity.name).find(Boolean) ||
      "",
    setId: String(primarySet.id),
    setName: primarySet.name,
    setSeries: primarySet.serie.name,
    setSeriesNames: Array.from(new Set(sourceSets.map((set) => set.serie.name))),
    cardType: sourceCard.supertype?.name || "",
    prices: {
      "Near Mint": null,
      "Lightly Played": null,
      "Moderately Played": null,
      "Heavily Played": null,
      Damaged: null,
    },
    shadow: false,
    variant,
    cardVariantTopLevel: sourceCard.cardVariantTopLevel?.name || variant,
    rarities: (sourceCard.rarities || [])
      .map((entry) => entry.rarity.name)
      .filter(Boolean),
    setNames: Array.from(new Set(sourceSets.map((set) => set.name))),
    collections: [],
  };
  for (const price of priceMap.get(sourceCard.tcgPlayerProductId) || []) {
    if (price.printing !== printing) continue;
    const condition = extractCondition(price.condition);
    if (condition) card.prices[condition] = price.marketPrice;
  }
  return card;
};

const publicDataUrl = (path: string) =>
  new URL(`data/${path}`, document.baseURI).toString();

const loadConditions = async (): Promise<ConditionsMap> => {
  if (conditionsPromise) return conditionsPromise;
  conditionsPromise = (async () => {
    const map: ConditionsMap = new Map();
    const response = await fetch(publicDataUrl("collector/conditions.json"));
    if (!response.ok) return map;
    const entries = (await response.json()) as ConditionsEntry[];
    for (const entry of entries) {
      if (!map.has(entry.id)) map.set(entry.id, new Map());
      map.get(entry.id)!.set(entry.collection, entry.conditions);
    }
    return map;
  })();
  return conditionsPromise;
};

const loadCollectionIndex = async (): Promise<
  Map<number, CollectionIndexEntry[]>
> => {
  if (collectionIndexPromise) return collectionIndexPromise;
  collectionIndexPromise = (async () => {
    const index = new Map<number, CollectionIndexEntry[]>();
    await mapWithConcurrency(COLLECTIONS, 8, async (collectionName) => {
      const response = await fetch(publicDataUrl(`collector/${collectionName}.json`));
      if (!response.ok) return;
      const cards = (await response.json()) as CollectorCard[];
      for (const card of cards) {
        const productId = Number(card.product_id);
        if (!Number.isInteger(productId)) continue;
        const entries = index.get(productId) || [];
        entries.push({ collectionName, card });
        index.set(productId, entries);
      }
    });
    return index;
  })();
  return collectionIndexPromise;
};

const addCollections = async (cards: Card[]): Promise<void> => {
  const [collectionIndex, conditionsMap] = await Promise.all([
    loadCollectionIndex(),
    loadConditions(),
  ]);
  const cardsByProduct = new Map<number, Card[]>();
  for (const card of cards) {
    if (!card.productId) continue;
    const candidates = cardsByProduct.get(card.productId) || [];
    candidates.push(card);
    cardsByProduct.set(card.productId, candidates);
  }
  for (const [productId, candidates] of cardsByProduct) {
    for (const entry of collectionIndex.get(productId) || []) {
      const wantsReverse = entry.collectionName.toLowerCase().includes("reverse");
      const preferred = wantsReverse
        ? candidates.find((card) => card.variant === "Reverse Holo")
        : candidates.find((card) => card.variant !== "Reverse Holo");
      const card = preferred || candidates[0];
      const override =
        conditionsMap.get(card.id)?.get(entry.collectionName) ??
        conditionsMap
          .get(card.id)
          ?.get(entry.collectionName.split("_").join(" "));
      card.collections ||= [];
      card.collections.push({
        name: entry.collectionName,
        collectorName: entry.card.product_name,
        quantity: override ?? { "Near Mint": Number(entry.card.quantity) || 0 },
      });
    }
  }
};

const generateUncached = async (seriesId: number): Promise<RuntimeCardsResult> => {
  const [source, prices] = await Promise.all([
    fetchJson<SourceCardsFile>(`${pokeDbApiBaseUrl}/cards?seriesId=${seriesId}`),
    loadPricesForSeries(seriesId),
  ]);
  const sourceCards = source.items || [];
  const cards = sourceCards
    .map((sourceCard) => createDashboardCard(sourceCard, prices.priceMap))
    .filter((card): card is Card => card !== null);
  await addCollections(cards);
  return {
    items: cards,
    meta: {
      seriesId,
      sourceCards: sourceCards.length,
      generatedCards: cards.length,
      priceSets: prices.setCount,
      priceProducts: prices.priceMap.size,
      priceCacheExpiresAt: new Date(prices.expiresAt).toISOString(),
      generatedAt: new Date().toISOString(),
    },
  };
};

export const generateCardsForSeries = (
  seriesId: number
): Promise<RuntimeCardsResult> => {
  if (!Number.isInteger(seriesId) || seriesId <= 0) {
    return Promise.reject(new Error("seriesId must be a positive integer"));
  }
  const cached = seriesCache.get(seriesId);
  const pricesAreCurrent =
    (pricesBySeries.get(seriesId)?.expiresAt || 0) > Date.now();
  if (cached && cached.expiresAt > Date.now() && pricesAreCurrent) {
    return Promise.resolve(cached.result);
  }
  const pending = pendingSeries.get(seriesId);
  if (pending) return pending;
  const generation = generateUncached(seriesId)
    .then((result) => {
      seriesCache.set(seriesId, {
        expiresAt: Date.now() + seriesTtlMs,
        result,
      });
      return result;
    })
    .finally(() => pendingSeries.delete(seriesId));
  pendingSeries.set(seriesId, generation);
  return generation;
};
