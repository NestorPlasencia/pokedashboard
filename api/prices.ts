import type { VercelRequest, VercelResponse } from "@vercel/node";

import { fetchPricesForSeries } from "../src/scripts/priceSource";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const rawSeriesId = Array.isArray(request.query.seriesId)
    ? request.query.seriesId[0]
    : request.query.seriesId;
  const seriesId = Number(rawSeriesId);
  if (!Number.isInteger(seriesId) || seriesId <= 0) {
    return response
      .status(400)
      .json({ error: "seriesId must be a positive integer" });
  }

  try {
    const prices = await fetchPricesForSeries(seriesId);
    response.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=3600, stale-if-error=86400"
    );
    response.setHeader("Vercel-Cache-Tag", "tcgplayer-prices");
    return response.status(200).json(prices);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return response
      .status(502)
      .json({ error: "Unable to load TCGPlayer prices", detail: message });
  }
}
