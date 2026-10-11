import type { ConditionKey } from '../types/dashboard';
import type { HistoryRow } from '../utils/reportHistory';
import { readStoredValue, REPORT_HISTORY_CACHE, writeStoredValue } from './offlineCache.ts';

type ExplorerResponse = { points: { productId: number; total: number; data: HistoryRow[] }[] };
type Entry = { storedAt: number; rows: HistoryRow[] };
export type HistoryLoad = { rows: HistoryRow[]; storedAt: number | null; stale: boolean; cachedProducts: number; fetchedProducts: number };
const TTL = 15 * 60 * 1000;
const cache = new Map<string, Entry>();
let generation = 0;
let storageQueue: Promise<void> = Promise.resolve();
let lastPruned = 0;
const mutateStorage = (action: () => Promise<void>) => {
  const task = storageQueue.then(action);
  storageQueue = task.catch(() => undefined);
  return task;
};
const storageAvailable = () => typeof window !== 'undefined' && 'caches' in window;
const remember = (key: string, entry: Entry) => {
  if (cache.size >= 800) cache.delete(cache.keys().next().value!);
  cache.set(key, entry);
};

// A request started before clearing cannot repopulate storage afterward.
export const clearReportHistoryCache = async () => {
  generation++; cache.clear(); lastPruned = 0;
  await mutateStorage(async () => { if (storageAvailable()) await window.caches.delete(REPORT_HISTORY_CACHE); });
};

const pruneStorage = async () => {
  if (!storageAvailable() || Date.now() - lastPruned < TTL) return;
  lastPruned = Date.now();
  try {
    const disk = await window.caches.open(REPORT_HISTORY_CACHE);
    const keys = await disk.keys();
    const entries = await Promise.all(keys.map(async key => {
      const response = await disk.match(key);
      return { key, bytes: Number(response?.headers.get('x-pokedashboard-size') ?? 0), storedAt: Number(response?.headers.get('x-pokedashboard-stored-at') ?? 0) };
    }));
    let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0), count = entries.length;
    for (const entry of entries.sort((a, b) => a.storedAt - b.storedAt)) {
      if (count <= 2500 && bytes <= 100 * 1024 * 1024) break;
      await disk.delete(entry.key); bytes -= entry.bytes; count--;
    }
  } catch { /* Storage is optional if blocked. */ }
};

export const loadReportHistorySnapshot = async (productIds: number[], condition: ConditionKey, signal: AbortSignal): Promise<HistoryLoad> => {
  const epoch = generation;
  const check = () => { signal.throwIfAborted(); if (epoch !== generation) throw new DOMException('La caché se limpió.', 'AbortError'); };
  check();
  const ids = [...new Set(productIds.filter(id => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
  const result: HistoryLoad = { rows: [], storedAt: null, stale: false, cachedProducts: 0, fetchedProducts: 0 };
  const include = (entry: Entry) => { result.rows.push(...entry.rows); result.storedAt = Math.min(result.storedAt ?? entry.storedAt, entry.storedAt); };
  for (let offset = 0; offset < ids.length; offset += 40) {
    check();
    const batch = ids.slice(offset, offset + 40);
    const entries = await Promise.all(batch.map(async id => {
      const key = `${condition}:${id}`;
      const stored = cache.get(key) ?? await readStoredValue<HistoryRow[]>(key, REPORT_HISTORY_CACHE).then(entry =>
        entry && Array.isArray(entry.value) ? { storedAt: entry.storedAt, rows: entry.value } : undefined);
      return { id, key, stored };
    }));
    check();
    const needed = entries.filter(({ stored }) => !stored || stored.storedAt + TTL <= Date.now());
    for (const { key, stored } of entries.filter(entry => !needed.includes(entry))) {
      include(stored!); remember(key, stored!); result.cachedProducts++;
    }
    if (!needed.length) continue;
    try {
      const response = await fetch('/api/report-history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ scope: 'product', ids: needed.map(entry => entry.id), condition, limit: 5000 }),
      });
      if (!response.ok) throw new Error('No se pudo cargar el historial de precios. Puedes volver a intentarlo.');
      const data = await response.json() as ExplorerResponse;
      check();
      if (!Array.isArray(data.points)) throw new Error('El historial de precios no tiene el formato esperado.');
      const responseRows = new Map<number, HistoryRow[]>();
      for (const product of data.points) {
        if (!Array.isArray(product.data) || product.total > product.data.length) throw new Error('El historial está incompleto. Reduce el grupo para consultar su tendencia.');
        responseRows.set(product.productId, product.data.map(row => ({ productId: product.productId, date: row.date, printing: row.printing ?? '', condition: row.condition,
          marketPrice: row.marketPrice, bucketDays: row.bucketDays, source: row.source, capturedAt: row.capturedAt })));
      }
      if (needed.some(entry => !responseRows.has(entry.id))) throw new Error('El historial no incluye todas las cartas solicitadas.');
      const storedAt = Date.now();
      await mutateStorage(async () => {
        check();
        for (const { id, key } of needed) {
          check();
          const entry = { storedAt, rows: responseRows.get(id)! };
          remember(key, entry); await writeStoredValue(key, entry.rows, REPORT_HISTORY_CACHE);
        }
      });
      check();
      for (const { id } of needed) include({ storedAt, rows: responseRows.get(id)! });
      result.fetchedProducts += needed.length;
    } catch (cause) {
      check();
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      if (needed.some(entry => !entry.stored)) throw cause;
      for (const { stored } of needed) include(stored!);
      result.stale = true; result.cachedProducts += needed.length;
    }
  }
  await mutateStorage(async () => { check(); await pruneStorage(); });
  check();
  return result;
};

export const loadReportHistory = async (ids: number[], condition: ConditionKey, signal: AbortSignal): Promise<HistoryRow[]> =>
  (await loadReportHistorySnapshot(ids, condition, signal)).rows;
