const DEFAULT_PRICE_EXPLORER_URL = "http://150.136.113.246/explorer";

export const PRICE_EXPLORER_MAX_IDS = 500;

const priceExplorerBaseUrl =
  import.meta.env.VITE_PRICE_EXPLORER_URL?.trim() || DEFAULT_PRICE_EXPLORER_URL;

export const normalizeProductIds = (
  ids: Array<number | null | undefined>
): number[] =>
  Array.from(
    new Set(
      ids.filter(
        (id): id is number => Number.isInteger(id) && (id as number) > 0
      )
    )
  );

export const buildPriceExplorerUrl = (
  ids: Array<number | null | undefined>
): string | null => {
  const productIds = normalizeProductIds(ids).slice(0, PRICE_EXPLORER_MAX_IDS);
  if (productIds.length === 0) return null;

  const url = new URL(priceExplorerBaseUrl);
  url.searchParams.set(productIds.length === 1 ? "id" : "ids", productIds.join(","));
  url.searchParams.set("scope", "product");
  return url.toString();
};

export const chunkProductIds = (
  ids: Array<number | null | undefined>
): number[][] => {
  const productIds = normalizeProductIds(ids);
  const chunks: number[][] = [];

  for (let index = 0; index < productIds.length; index += PRICE_EXPLORER_MAX_IDS) {
    chunks.push(productIds.slice(index, index + PRICE_EXPLORER_MAX_IDS));
  }

  return chunks;
};
