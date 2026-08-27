import type { TrendSeries } from '../types/dashboard';

export interface TrendBatchResponse { trends: TrendSeries[]; missingIds: number[]; }

// Keep the browser request same-origin by default; Vite/Vercel proxy this path
// to the data service. A direct URL can still be supplied for local debugging.
const endpoint = import.meta.env.VITE_TREND_POINTS_URL || '/api/trend-points';

export async function fetchTrendPoints(ids: number[], filters: { printing?: string; condition?: string } = {}): Promise<TrendBatchResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, ...filters }),
  });
  if (!response.ok) throw new Error(`Trend Points responded with HTTP ${response.status}`);
  return response.json() as Promise<TrendBatchResponse>;
}
