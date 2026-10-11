import type { ConditionKey } from '../types/dashboard';
import type { FilterParams } from '../utils/urlParams';
import { REPORT_CONDITIONS, reportFilters } from '../utils/reportFilters.ts';

export type SavedReport = { id: string; name: string; filters: FilterParams; condition: ConditionKey; group?: string };
export type ReportGrouping = 'auto' | 'series' | 'custom' | 'none';
export type ReportsState = { reports: SavedReport[]; selectedIds: string[]; grouping?: ReportGrouping; ownershipCollections?: string[] };
export type ReportSplit = 'set' | 'rarity';
export type PlannedReport = Omit<SavedReport, 'id'> & { existingId?: string };
const storageKey = (userId: string) => `pokedashboard:reports:v1:${userId || 'guest'}`;

/** Absent uses legacy per-report scopes; an empty shared selection uses all inventory. */
export const reportCollectionNames = (report: SavedReport, state: ReportsState): string[] =>
  state.ownershipCollections ?? report.filters.collections ?? [];

/** Reorder selected reports in their existing slots, leaving other rows untouched. */
export const orderSelectedReports = <T>(items: T[], selectedIds: string[], identify: (item: T) => string, compare: (a: T, b: T) => number): T[] => {
  const selection = new Set(selectedIds);
  const selected = items.filter(item => selection.has(identify(item))).sort(compare);
  let index = 0;
  return items.map(item => selection.has(identify(item)) ? selected[index++] : item);
};

export const groupReportList = (reports: SavedReport[], grouping: ReportGrouping = 'auto') => {
  const sections = new Map<string, { key: string; name: string; reports: SavedReport[] }>();
  for (const report of reports) {
    const series = [...(report.filters.series ?? [])].sort().join(', ');
    const kind = report.filters.set?.length ? 'Sets' : report.filters.rarity?.length ? 'Rarezas' : 'Otros';
    const name = grouping === 'none' ? 'Todos' : grouping === 'series' ? series : grouping === 'custom' ? report.group || 'Sin grupo' : report.group || `${kind} · ${series}`;
    const key = JSON.stringify([grouping, name]);
    if (!sections.has(key)) sections.set(key, { key, name, reports: [] });
    sections.get(key)!.reports.push(report);
  }
  return [...sections.values()];
};

export const assignReportGroup = (state: ReportsState, ids: string[], group: string): ReportsState => ({
  ...state,
  reports: state.reports.map(report => {
    if (!ids.includes(report.id)) return report;
    const next = { ...report };
    if (group.trim()) next.group = group.trim();
    else delete next.group;
    return next;
  }),
});

export const reportBaseFilters = (filters: FilterParams, split: ReportSplit): FilterParams => {
  const base = reportFilters(filters);
  delete base[split];
  delete base[split === 'set' ? 'notSet' : 'notRarity'];
  return base;
};

const filterSignature = (filters: FilterParams): string => JSON.stringify(Object.entries(reportFilters(filters))
  .filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value))
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value]));

/** Split a template without mutating it; equivalent filters retain their saved ID. */
export const planReportsBy = (template: SavedReport, split: ReportSplit, values: string[], existing: SavedReport[], prefix = ''): PlannedReport[] => {
  const base = reportBaseFilters(template.filters, split);
  const signatures = new Map(existing.filter(report => report.condition === template.condition)
    .map(report => [filterSignature(report.filters), report.id]));
  return [...new Set(values.filter(value => value && value !== 'All'))].map(value => {
    const filters = { ...base, [split]: [value] };
    return { name: prefix.trim() ? `${prefix.trim()} · ${value}` : value, filters, condition: template.condition, ...(template.group?.trim() ? { group: template.group.trim() } : {}),
      existingId: signatures.get(filterSignature(filters)) };
  });
};

export const parseReports = (raw: unknown): ReportsState => {
  if (!raw || typeof raw !== 'object') throw new Error('El archivo de informes no es válido.');
  const state = raw as Record<string, unknown>;
  if (!Array.isArray(state.reports)) throw new Error('La lista de informes no es válida.');
  const reports = state.reports.map((value): SavedReport => {
    if (!value || typeof value !== 'object') throw new Error('Informe no válido.');
    const report = value as SavedReport;
    if (typeof report.id !== 'string' || !report.id || typeof report.name !== 'string' || !report.name.trim() ||
      !REPORT_CONDITIONS.includes(report.condition) || !report.filters || typeof report.filters !== 'object') throw new Error('Informe no válido.');
    const filters = reportFilters(report.filters);
    if (!filters.series?.length) throw new Error('Cada informe debe elegir al menos una serie.');
    const minimum = filters.priceMin ? Number(filters.priceMin) : null;
    const maximum = filters.priceMax ? Number(filters.priceMax) : null;
    if ([minimum, maximum].some(price => price !== null && (!Number.isFinite(price) || price < 0)) ||
      (minimum !== null && maximum !== null && minimum > maximum)) throw new Error('El rango de precios no es válido.');
    if (report.group !== undefined && (typeof report.group !== 'string' || report.group.trim().length > 100)) throw new Error('El nombre de grupo no es válido.');
    return { id: report.id, name: report.name.trim(), condition: report.condition, filters, ...(report.group?.trim() ? { group: report.group.trim() } : {}) };
  });
  if (new Set(reports.map(report => report.id)).size !== reports.length) throw new Error('Hay informes duplicados.');
  const selectedIds = Array.isArray(state.selectedIds)
    ? [...new Set(state.selectedIds.filter((id): id is string => typeof id === 'string' && reports.some(report => report.id === id)))] : [];
  if (state.grouping !== undefined && !['auto', 'series', 'custom', 'none'].includes(state.grouping as string)) throw new Error('La agrupación de informes no es válida.');
  if (state.ownershipCollections !== undefined && (!Array.isArray(state.ownershipCollections) || state.ownershipCollections.some(name => typeof name !== 'string' || !name.trim()))) throw new Error('Las colecciones comunes no son válidas.');
  const ownershipCollections = state.ownershipCollections === undefined ? undefined : [...new Set((state.ownershipCollections as string[]).map(name => name.trim()))];
  return { reports, selectedIds, ...(state.grouping === undefined ? {} : { grouping: state.grouping as ReportGrouping }), ...(ownershipCollections === undefined ? {} : { ownershipCollections }) };
};

export const readReports = (userId: string): ReportsState => {
  const raw = window.localStorage.getItem(storageKey(userId));
  return raw ? parseReports(JSON.parse(raw)) : { reports: [], selectedIds: [], ownershipCollections: [] };
};
export const writeReports = (userId: string, state: ReportsState): void => {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(parseReports(state)));
};
