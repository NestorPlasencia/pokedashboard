import type { PriceEntry } from "../types/source-card";

type TcgSet = { setNameId: number; active: boolean };
type SetCatalogResponse = { results?: TcgSet[] };

export type PriceBundle = {
  generatedAt: string;
  setCount: number;
  products: Record<string, PriceEntry[]>;
};

const catalogUrl =
  "https://mpapi.tcgplayer.com/v2/Catalog/SetNames?categoryId=3&active=true";
const priceGuideBaseUrl =
  "https://infinite-api.tcgplayer.com/priceguide/set";

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const fetchJson = async <T>(url: string): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json, text/plain, */*" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return (await response.json()) as T;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await wait(1_000 * 2 ** attempt);
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

export const fetchAllPrices = async (): Promise<PriceBundle> => {
  const catalog = await fetchJson<SetCatalogResponse>(catalogUrl);
  const setIds = Array.from(
    new Set(
      (catalog.results || [])
        .filter((set) => set.active)
        .map((set) => set.setNameId)
    )
  ).sort((left, right) => left - right);

  const pricesBySet = await mapWithConcurrency(setIds, 4, async (setId) => {
    const response = await fetchJson<{ result?: PriceEntry[] }>(
      `${priceGuideBaseUrl}/${setId}/cards/?rows=10000&productTypeID=1`
    );
    return response.result || [];
  });

  const products: Record<string, PriceEntry[]> = {};
  for (const prices of pricesBySet) {
    for (const price of prices) {
      const key = String(price.productID);
      (products[key] ||= []).push(price);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    setCount: setIds.length,
    products,
  };
};
