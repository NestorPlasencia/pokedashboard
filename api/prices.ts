import { fetchPricesForSeries } from "../src/scripts/priceSource.js";

const json = (
  body: unknown,
  status: number,
  headers?: Record<string, string>
) =>
  Response.json(body, { status, headers });

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
    }

    const seriesId = Number(new URL(request.url).searchParams.get("seriesId"));
    if (!Number.isInteger(seriesId) || seriesId <= 0) {
      return json({ error: "seriesId must be a positive integer" }, 400);
    }

    try {
      const prices = await fetchPricesForSeries(seriesId);
      return json(prices, 200, {
        "Cache-Control":
          "public, max-age=0, s-maxage=86400, stale-while-revalidate=3600, stale-if-error=86400",
        "Vercel-Cache-Tag": "tcgplayer-prices",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json(
        { error: "Unable to load TCGPlayer prices", detail: message },
        502
      );
    }
  },
};
