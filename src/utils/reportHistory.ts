import type { Card, ConditionKey } from '../types/dashboard';

export type HistoryPoint = { date: string; price: number };
export type HistoryRow = { productId: number; date: string; printing: string; condition: string; marketPrice: number | null; bucketDays?: number; source?: string; capturedAt?: string };
export type ReportCurve = { points: HistoryPoint[]; covered: number; total: number; firstDate: string | null; lastDate: string | null; freshCovered?: number; observationDates?: string[] };
const DAY = 86400000;
const normalized = (printing: string) => printing.trim().toLowerCase();
const rank = (row: HistoryRow) => (row.bucketDays === 1 ? 0 : row.bucketDays === 3 ? 10 : row.bucketDays === 7 ? 20 : 30) + (row.source === 'price_history' ? 0 : 1);

export const indexReportHistory = (rows: HistoryRow[], condition: ConditionKey): Map<string, HistoryPoint[]> => {
  const byPrinting = new Map<string, Map<string, HistoryRow>>();
  for (const row of rows) {
    if (row.condition !== condition || row.marketPrice == null || !Number.isFinite(row.marketPrice) || row.marketPrice < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date))) continue;
    const key = `${row.productId}:${normalized(row.printing)}`;
    const dates = byPrinting.get(key) ?? new Map<string, HistoryRow>();
    const previous = dates.get(row.date);
    if (!previous || rank(row) < rank(previous) || (rank(row) === rank(previous) && (row.capturedAt ?? '') > (previous.capturedAt ?? ''))) dates.set(row.date, row);
    byPrinting.set(key, dates);
  }
  return new Map([...byPrinting].map(([key, dates]) => [key, [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)).map(row => ({ date: row.date, price: row.marketPrice! }))]));
};

export const aggregateReportHistory = (cards: Card[], history: Map<string, HistoryPoint[]>, today = new Date().toISOString().slice(0, 10)): ReportCurve => {
  const unique = [...new Map(cards.map(card => [card.id, card])).values()];
  const series = unique.flatMap(card => {
    if (!card.productId || !card.printing) return [];
    const points = history.get(`${card.productId}:${normalized(card.printing)}`)?.filter(point => point.date <= today);
    return points?.length ? [points] : [];
  });
  const result: ReportCurve = { points: [], total: unique.length, covered: series.length, firstDate: null, lastDate: null };
  if (!series.length) return result;
  // Start only when all covered cards have a known price. Otherwise a new card's
  // first observation would look like market growth. Carry the last observation
  // through gaps; never interpolate a guessed price or backfill before launch.
  const start = Math.max(...series.map(points => Date.parse(points[0].date)));
  const end = Math.max(...series.map(points => Date.parse(points[points.length - 1].date)));
  // Forward-filling a stale component must not masquerade as price stability.
  result.freshCovered = series.filter(points => Date.parse(today) - Date.parse(points[points.length - 1].date) <= 7 * DAY).length;
  result.observationDates = [...new Set(series.flatMap(points => points.map(point => point.date)))].sort();
  const indices = series.map(() => 0);
  for (let day = start; day <= end; day += DAY) {
    const date = new Date(day).toISOString().slice(0, 10);
    let price = 0;
    series.forEach((points, index) => {
      while (indices[index] + 1 < points.length && points[indices[index] + 1].date <= date) indices[index]++;
      price += points[indices[index]].price;
    });
    result.points.push({ date, price });
  }
  result.firstDate = result.points[0]?.date ?? null;
  result.lastDate = result.points[result.points.length - 1]?.date ?? null;
  return result;
};
