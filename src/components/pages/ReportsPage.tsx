import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChartNoAxesCombined, ChevronDown, ChevronRight, Copy, Download, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOptionsContext } from '../../context/OptionsContext';
import { getRegionForPokedexNumber } from '../../constants/constants';
import type { InventorySnapshot } from '../../services/inventory';
import type { InventoryStatus } from '../../hooks/useLoadCards';
import { loadHierarchy } from '../../services/cards';
import { applyInventoryToCards, clearRuntimeCardsCache, generateCardsForSeries } from '../../services/runtimeCards';
import { assignReportGroup, groupReportList, orderSelectedReports, parseReports, planReportsBy, readReports, reportBaseFilters, reportCollectionNames, writeReports, type ReportGrouping, type ReportSplit, type ReportsState, type SavedReport } from '../../services/reports';
import { clearReportHistoryCache, loadReportHistorySnapshot } from '../../services/reportHistory';
import { readCacheOverview, REPORT_HISTORY_CACHE } from '../../services/offlineCache';
import { readBuyingPreferences, writeBuyingPreferences } from '../../services/buyingPreferences';
import { aggregateReportHistory, indexReportHistory, type HistoryPoint } from '../../utils/reportHistory';
import { analyzeBuying, compareBuyingAnalysis, SIGNAL_LABELS, type BuyingAnalysis, type BuyingOrder } from '../../utils/reportAnalysis';
import { filterReportCards, partitionReportCards, REPORT_CONDITIONS, REPORT_FIELDS, reportFilters, reportQuery, reportValue } from '../../utils/reportFilters';
import { excludeParam, parseUrlParams, type FilterParams } from '../../utils/urlParams';
import type { Card, ConditionKey } from '../../types/dashboard';
import type { HierarchySerie } from '../../types/source-card';
import { ReportChart } from '../reports/ReportChart';
import { money, REPORT_COLORS } from '../../utils/reportDisplay';
import { ReportFilterPicker } from '../reports/ReportFilterPicker';
import { BuyingBadge, BuyingPanel } from '../reports/BuyingPanel';
import { BuyingCardList } from '../reports/BuyingCardList';
import { ChartBuyingAnalysis } from '../reports/ChartBuyingAnalysis';
import './reports.css';

type Group = 'total' | 'owned' | 'missing';
const GROUP_LABELS: Record<Group, string> = { total: 'Total', owned: 'Tenemos', missing: 'Faltan' };
const GROUPS: Group[] = ['total', 'owned', 'missing'];
const initialDraft = (): SavedReport => {
  const params = parseUrlParams();
  return { id: '', name: '', condition: REPORT_CONDITIONS.find(condition => params.conditions?.includes(condition)) ?? 'Near Mint', filters: reportFilters(params) };
};
const download = (content: string, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const ReportsPage = ({ inventory, inventoryStatus, inventoryError }: {
  inventory: InventorySnapshot | null; inventoryStatus: InventoryStatus; inventoryError: string | null;
}) => {
  const { session, refreshInventory, requestSignIn } = useAuth();
  const { collections } = useOptionsContext();
  const userId = session?.user.id ?? '';
  const initial = useMemo(() => {
    try { return { state: readReports(userId), error: '' }; }
    catch { return { state: { reports: [], selectedIds: [], ownershipCollections: [] } as ReportsState, error: 'No se pudieron leer los informes guardados en este navegador.' }; }
  }, [userId]);
  const [state, setState] = useState(initial.state);
  const [error, setError] = useState(initial.error);
  const [draft, setDraft] = useState<SavedReport>(initialDraft);
  const [editorOpen, setEditorOpen] = useState(!initial.state.reports.length);
  const [createMode, setCreateMode] = useState<'single' | ReportSplit>('single');
  const [templateId, setTemplateId] = useState('');
  const [batchValues, setBatchValues] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [groupName, setGroupName] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [importUrl, setImportUrl] = useState('');
  const [deleted, setDeleted] = useState<SavedReport | null>(null);
  const [hierarchy, setHierarchy] = useState<HierarchySerie[]>([]);
  const [catalog, setCatalog] = useState<{ key: string; cards: Card[]; error: string }>({ key: '', cards: [], error: '' });
  const [refreshTick, setRefreshTick] = useState(0);
  const [group, setGroup] = useState<Group>(session ? 'missing' : 'total');
  const [percent, setPercent] = useState(false);
  const [days, setDays] = useState(0);
  const preferences = useMemo(() => readBuyingPreferences(userId), [userId]);
  const [analysisActive, setAnalysisActive] = useState(preferences.enabled);
  const [analysisScope, setAnalysisScope] = useState(preferences.scope);
  const [buyingGroup, setBuyingGroup] = useState(preferences.group);
  const [analysisDays, setAnalysisDays] = useState(preferences.days);
  const [listOrder, setListOrder] = useState(preferences.order);
  const [historyPaused, setHistoryPaused] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [cacheInfo, setCacheInfo] = useState({ storedAt: null as number | null, stale: false, cached: 0, fetched: 0 });
  const [history, setHistory] = useState<{ key: string; data: Map<string, Map<string, HistoryPoint[]>>; error: string }>({ key: '', data: new Map(), error: '' });
  const seriesKey = JSON.stringify([...new Set([...state.reports.flatMap(report => report.filters.series ?? []), ...(editorOpen ? draft.filters.series ?? [] : [])])].sort());
  const catalogKey = `${seriesKey}:${refreshTick}`;

  useEffect(() => {
    try { writeBuyingPreferences(userId, { enabled: analysisActive, scope: analysisScope, group: buyingGroup, days: analysisDays, order: listOrder }); }
    catch { setError('Las preferencias del análisis no se pudieron guardar en este navegador.'); }
  }, [userId, analysisActive, analysisScope, buyingGroup, analysisDays, listOrder]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const navigation = await loadHierarchy();
        if (cancelled) return;
        setHierarchy(navigation);
        const names: string[] = JSON.parse(seriesKey);
        const selected = navigation.filter(serie => names.includes(serie.name));
        if (names.some(name => !navigation.some(serie => serie.name === name))) throw new Error('Una serie guardada ya no está disponible. Edita el informe para elegir otra.');
        const cards: Card[] = [];
        // Bound simultaneous catalog/price requests when comparing several eras.
        for (let offset = 0; offset < selected.length; offset += 3) {
          const results = await Promise.all(selected.slice(offset, offset + 3).map(serie => generateCardsForSeries(serie.id)));
          if (cancelled) return;
          results.forEach(result => cards.push(...result.items));
        }
        if (!cancelled) setCatalog({ key: catalogKey, cards: [...new Map(cards.map(card => [card.id, card])).values()], error: '' });
      } catch (cause) {
        if (!cancelled) setCatalog({ key: catalogKey, cards: [], error: cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [seriesKey, catalogKey]);

  // Prices use the same cache as the catalog; re-evaluate while the page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setRefreshTick(tick => tick + 1), 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const catalogReady = catalog.key === catalogKey && !catalog.error;
  const inventoryReady = Boolean(session && inventory);
  const availableCollections = inventoryReady ? collections.filter(collection => collection.kind === 'owned') : [];
  const sharedOwnership = state.ownershipCollections !== undefined;
  const draftCollections = state.ownershipCollections ?? draft.filters.collections ?? [];
  const applied = useMemo(() => inventory ? applyInventoryToCards(catalog.cards, inventory) : catalog.cards, [catalog.cards, inventory]);
  const results = useMemo(() => state.reports.map(report => {
    const cards = filterReportCards(applied, report.filters, report.condition);
    const collectionNames = reportCollectionNames(report, state);
    return { report, cards, collectionNames, groups: partitionReportCards(cards, collectionNames, collections) };
  }), [applied, state, collections]);
  const draftCards = useMemo(() => filterReportCards(applied, { series: draft.filters.series, notSeries: draft.filters.notSeries }, draft.condition), [applied, draft.filters.series, draft.filters.notSeries, draft.condition]);
  const draftPreview = useMemo(() => filterReportCards(applied, draft.filters, draft.condition), [applied, draft]);
  const draftValuation = useMemo(() => reportValue(draftPreview, draft.condition), [draftPreview, draft.condition]);
  const batchCards = useMemo(() => createMode === 'single' ? [] : filterReportCards(applied, reportBaseFilters(draft.filters, createMode), draft.condition), [applied, draft, createMode]);
  const batchOptions = useMemo(() => [...new Set(batchCards.flatMap(card => createMode === 'set' ? card.setNames : card.rarities ?? []))].sort((a, b) => a.localeCompare(b)), [batchCards, createMode]);
  const batchPlan = useMemo(() => createMode === 'single' ? [] : planReportsBy(draft, createMode, batchValues, state.reports, draft.name)
    .map(report => ({ ...report, cards: filterReportCards(applied, report.filters, report.condition).length })), [draft, createMode, batchValues, state.reports, applied]);
  const batchNew = batchPlan.filter(report => !report.existingId);
  const batchExisting = batchPlan.length - batchNew.length;
  const requestsKey = JSON.stringify(REPORT_CONDITIONS.flatMap(condition => {
    const ids = [...new Set(results.filter(result => (state.selectedIds.includes(result.report.id) || (analysisActive && analysisScope === 'all')) && result.report.condition === condition).flatMap(result => result.cards.flatMap(card => card.productId ? [card.productId] : [])))].sort((a, b) => a - b);
    return ids.length ? [{ condition, ids }] : [];
  }));
  const historyKey = `${requestsKey}:${refreshTick}`;
  useEffect(() => {
    if (!catalogReady || historyPaused) return;
    const controller = new AbortController();
    const requests: { condition: ConditionKey; ids: number[] }[] = JSON.parse(requestsKey);
    const load = async () => {
      try {
        const data = new Map<string, Map<string, HistoryPoint[]>>();
        const info = { storedAt: null as number | null, stale: false, cached: 0, fetched: 0 };
        for (const request of requests) {
          const loaded = await loadReportHistorySnapshot(request.ids, request.condition, controller.signal);
          data.set(request.condition, indexReportHistory(loaded.rows, request.condition));
          if (loaded.storedAt !== null) info.storedAt = Math.min(info.storedAt ?? loaded.storedAt, loaded.storedAt);
          info.stale ||= loaded.stale; info.cached += loaded.cachedProducts; info.fetched += loaded.fetchedProducts;
        }
        if (!controller.signal.aborted) {
          setHistory({ key: historyKey, data, error: '' }); setCacheInfo(info);
          const overview = await readCacheOverview();
          if (!controller.signal.aborted) setCacheBytes(overview.reports.find(report => report.name === REPORT_HISTORY_CACHE)?.bytes ?? null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setHistory({ key: historyKey, data: new Map(), error: cause instanceof Error ? cause.message : 'No se pudo cargar el historial.' });
      }
    };
    void load();
    return () => controller.abort();
  }, [requestsKey, historyKey, catalogReady, historyPaused]);
  const historyReady = catalogReady && history.key === historyKey && !history.error && !historyPaused;
  const curves = useMemo(() => results.map(result => ({ ...result, curves: Object.fromEntries(GROUPS.map(key =>
    [key, aggregateReportHistory(result.groups[key], history.data.get(result.report.condition) ?? new Map())])) as Record<Group, ReturnType<typeof aggregateReportHistory>> })), [results, history.data]);
  const analyzedCurves = useMemo(() => curves.map(result => ({ ...result, analyses: Object.fromEntries(GROUPS.map(key => {
    const analysis = analyzeBuying(result.curves[key], analysisDays);
    return [key, cacheInfo.stale ? { ...analysis, score: null, signal: 'stale', reasons: ['La actualización falló; actualiza antes de asignar prioridad de compra.'] } : analysis];
  })) as Record<Group, BuyingAnalysis> })), [curves, analysisDays, cacheInfo.stale]);
  const buyingEntries = useMemo(() => orderSelectedReports(analyzedCurves.filter(result => (buyingGroup === 'total' || inventoryReady) && (analysisScope === 'all' || state.selectedIds.includes(result.report.id)))
    .map(result => ({ report: result.report, cards: result.groups[buyingGroup].length, analysis: result.analyses[buyingGroup] })),
    state.selectedIds, entry => entry.report.id, (a, b) => compareBuyingAnalysis(a.analysis, b.analysis, listOrder)), [analyzedCurves, analysisScope, state.selectedIds, buyingGroup, inventoryReady, listOrder]);
  const analysisReady = analysisActive && historyReady && (buyingGroup === 'total' || inventoryReady);
  const analysisById = new Map(buyingEntries.map(entry => [entry.report.id, entry.analysis]));
  const priorityOrder = new Map(buyingEntries.filter(entry => state.selectedIds.includes(entry.report.id)).map((entry, index) => [entry.report.id, index]));
  const selectedReports = analyzedCurves.filter(result => state.selectedIds.includes(result.report.id)).sort((a, b) => listOrder !== 'saved' && analysisReady ? (priorityOrder.get(a.report.id) ?? Infinity) - (priorityOrder.get(b.report.id) ?? Infinity) : 0);
  const comparison = selectedReports.filter(() => group === 'total' || inventoryReady);
  const grouping = state.grouping ?? 'auto';
  const reportSections = groupReportList(state.reports, grouping).map(section => ({ ...section,
    reports: listOrder !== 'saved' && analysisReady ? orderSelectedReports(section.reports, state.selectedIds, report => report.id,
      (a, b) => (priorityOrder.get(a.id) ?? Infinity) - (priorityOrder.get(b.id) ?? Infinity)) : section.reports }));
  const resultsById = new Map(results.map((result, index) => [result.report.id, { ...result, index }]));
  const groupNames = [...new Set(state.reports.flatMap(report => report.group ? [report.group] : []))].sort((a, b) => a.localeCompare(b));
  const changeOrder = (order: BuyingOrder) => {
    setListOrder(order);
    if (order !== 'saved') {
      setAnalysisActive(true); setHistoryPaused(false); setAnalysisScope('selected');
    }
  };
  const commit = (next: ReportsState) => {
    try { const normalized = parseReports(next); writeReports(userId, normalized); setState(normalized); setError(''); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los informes.'); return false; }
  };
  const showReport = (id: string) => {
    if (historyPaused) { setHistoryPaused(false); setRefreshTick(tick => tick + 1); }
    if (!state.selectedIds.includes(id) && !commit({ ...state, selectedIds: [...state.selectedIds, id] })) return;
    window.requestAnimationFrame(() => document.getElementById(`report-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const editReport = (report: SavedReport) => {
    setDraft(report); setCreateMode('single'); setEditorOpen(true); setImportUrl('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const updateFilters = (patch: Partial<FilterParams>) => setDraft(current => ({ ...current, filters: { ...current.filters, ...patch } }));
  const openBatch = (template?: SavedReport) => {
    setDraft(template ? { ...template, id: '', name: '', filters: reportFilters(template.filters) } : initialDraft());
    setTemplateId(template?.id ?? '');
    setCreateMode(template && !template.filters.set?.length && template.filters.rarity?.length ? 'rarity' : 'set');
    setBatchValues([]); setImportUrl(''); setNotice(''); setError(''); setEditorOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.filters.series?.length || (createMode === 'single' && !draft.name.trim())) { setError('Elige al menos una serie y, para un informe individual, escribe un nombre.'); return; }
    const minimum = draft.filters.priceMin ? Number(draft.filters.priceMin) : null;
    const maximum = draft.filters.priceMax ? Number(draft.filters.priceMax) : null;
    if ((minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) || (maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) || (minimum !== null && maximum !== null && minimum > maximum)) { setError('Revisa el rango de precios.'); return; }
    if (createMode !== 'single') {
      if (!batchNew.length || !catalogReady) { setError('Elige al menos una opción nueva y espera a que cargue la vista previa.'); return; }
      const added: SavedReport[] = batchNew.map(({ name, condition, filters, group }) => ({ id: crypto.randomUUID(), name, condition, filters, ...(group ? { group } : {}) }));
      if (commit({ ...state, reports: [...state.reports, ...added] })) {
        setEditorOpen(false); setDeleted(null);
        setNotice(`${added.length === 1 ? 'Se creó 1 informe' : `Se crearon ${added.length} informes`}${batchExisting ? batchExisting === 1 ? '; 1 ya existía y se omitió' : `; ${batchExisting} ya existían y se omitieron` : ''}. Márcalos en la lista para ver sus gráficas.`);
      }
      return;
    }
    const report = { ...draft, id: draft.id || crypto.randomUUID(), name: draft.name.trim(), filters: reportFilters(draft.filters) };
    const reports = draft.id ? state.reports.map(item => item.id === draft.id ? report : item) : [...state.reports, report];
    if (commit({ ...state, reports, selectedIds: [...new Set([...state.selectedIds, report.id])] })) { setEditorOpen(false); setDeleted(null); setNotice(''); }
  };
  const importFiltersFromUrl = (value: string) => {
    try {
      const url = new URL(value, window.location.origin);
      if (!url.search) throw new Error('Pega un enlace del catálogo que incluya filtros.');
      const params = parseUrlParams(url.search);
      setDraft(current => ({ ...current, filters: reportFilters(params), condition: REPORT_CONDITIONS.find(condition => params.conditions?.includes(condition)) ?? 'Near Mint' }));
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'El enlace no es válido.'); }
  };
  const exportCsv = () => {
    const rows = [['Informe', 'Grupo', 'Cartas', 'Valor USD', 'Sin precio', 'Condición']];
    for (const result of results) for (const key of GROUPS) {
      const known = key === 'total' || inventoryReady;
      const valuation = reportValue(result.groups[key], result.report.condition);
      rows.push([result.report.name, GROUP_LABELS[key], known ? String(result.groups[key].length) : '', known ? valuation.value.toFixed(2) : '', known ? String(valuation.unpriced) : '', result.report.condition]);
    }
    const csv = rows.map(row => row.map(cell => `"${(/^[=+\-@]/.test(cell) ? "'" : '') + cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`\uFEFF${csv}`, 'pokedashboard-informes.csv', 'text/csv;charset=utf-8');
  };
  const clearAnalysisCache = async () => {
    setClearingCache(true); setHistoryPaused(true);
    try {
      await clearReportHistoryCache();
      setHistory({ key: '', data: new Map(), error: '' });
      setCacheInfo({ storedAt: null, stale: false, cached: 0, fetched: 0 }); setCacheBytes(0);
      setNotice('Caché del historial y resultados del análisis limpiados. Pulsa Analizar informes o Actualizar para volver a consultar.');
    } catch { setError('No se pudo limpiar la caché. Revisa los permisos de almacenamiento del navegador.'); }
    finally { setClearingCache(false); }
  };
  const exportAnalysis = () => {
    const rows = [['Informe', 'Objetivo', 'Ventana días', 'Prioridad', 'Señal', 'Precio histórico USD', 'Mínimo USD', 'Fecha mínimo', 'Sobre mínimo %', 'Desde máximo %', '7 días %', '30 días %', 'Último dato', 'Cobertura %', 'Razones'],
      ...buyingEntries.map(({ report, analysis: a }) => [report.name, GROUP_LABELS[buyingGroup], String(analysisDays), String(a.score ?? ''), SIGNAL_LABELS[a.signal], String(a.current ?? ''), String(a.minimum ?? ''), a.minimumDate ?? '', String(a.aboveMinimum ?? ''), String(a.drawdown ?? ''), String(a.change7 ?? ''), String(a.change30 ?? ''), a.asOf ?? '', String(a.coverage * 100), a.reasons.join(' ')])];
    download(`\uFEFF${rows.map(row => row.map(cell => `"${(/^[=+\-@]/.test(cell) ? "'" : '') + cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')}`, 'pokedashboard-prioridad-compra.csv', 'text/csv;charset=utf-8');
  };

  return <div className="collections-page reports-page"><main className="collections-page__body">
    <div className="report-page-heading">
      <div className="collections-page__intro"><h1><ChartNoAxesCombined size={26} aria-hidden="true" /> Informes</h1>
        <p>Guarda grupos de cartas y compara su valor, lo que tienes y lo que falta.</p></div>
      <div className="report-actions"><button type="button" onClick={() => { setDraft(initialDraft()); setCreateMode('single'); setTemplateId(''); setEditorOpen(true); setImportUrl(''); setNotice(''); }}><Plus size={16} /> Nuevo informe</button>
        <button type="button" onClick={() => openBatch()}><Copy size={16} /> Crear varios</button>
        <button type="button" disabled={clearingCache} onClick={async () => {
          setClearingCache(true); setHistoryPaused(true);
          try { await clearReportHistoryCache(); clearRuntimeCardsCache(); setHistoryPaused(false); setRefreshTick(tick => tick + 1); refreshInventory(); }
          catch { setError('No se pudo limpiar la caché para actualizar.'); }
          finally { setClearingCache(false); }
        }}><RefreshCw size={16} /> Actualizar</button></div>
    </div>
    <p className="report-note">Los informes se guardan en este navegador, separados por cuenta. Los filtros se conservan; los precios y la pertenencia a tus colecciones se recalculan al cargar los datos.</p>
    {error && <p className="report-message report-message--error" role="alert">{error}</p>}
    {notice && <p className="report-message" role="status">{notice}</p>}
    <section className="report-panel report-ownership" aria-labelledby="report-ownership-title">
      <h2 id="report-ownership-title">Colecciones para Tenemos / Faltan</h2>
      <label className="report-ownership-controls">Origen de Tenemos y Faltan<select aria-label="Origen de Tenemos y Faltan" value={sharedOwnership ? 'shared' : 'individual'} onChange={event => {
        const next = { ...state };
        if (event.target.value === 'shared') next.ownershipCollections = [];
        else delete next.ownershipCollections;
        commit(next);
      }}><option value="shared">Selección común para todos los informes</option><option value="individual">Colecciones de cada informe</option></select></label>
      {sharedOwnership ? <>
        <p className="report-note">Tenemos cuenta las cartas con al menos una copia en cualquiera de estas colecciones; Faltan cuenta las que no están en ellas. La selección se aplica a todos los informes, sus gráficas, señales y enlaces de Abrir cartas.</p>
        {inventoryReady ? <ReportFilterPicker label="Colecciones que cuentan como Tenemos" options={availableCollections.map(collection => collection.name)} included={state.ownershipCollections} allowExclude={false} emptyLabel="Todo el inventario" defaultOpen noOptionsLabel="No hay colecciones de inventario disponibles." onChange={included => commit({ ...state, ownershipCollections: included })} />
          : <p className="report-note">{!session ? 'Inicia sesión para elegir tus colecciones.' : inventoryStatus === 'error' ? 'No se pudieron cargar tus colecciones.' : 'Cargando tus colecciones…'}</p>}
        <p className="report-note">Sin elegir colecciones se usa todo tu inventario. Se incluyen las subcolecciones y se cuenta una carta por variante. Esta selección se guarda por cuenta e incluye los informes nuevos.</p>
      </> : <p className="report-note">Se conservan las colecciones guardadas en cada informe. Elige «Selección común para todos los informes» para usar un mismo criterio en Tenemos y Faltan.</p>}
    </section>
    {inventoryError && <p className="report-message report-message--error" role="alert">{inventoryError}{inventoryReady ? ' Se muestra el último inventario disponible.' : ''}</p>}
    {!session ? <div className="report-message">Inicia sesión para calcular Tenemos y Faltan. <button type="button" onClick={requestSignIn}>Iniciar sesión</button></div>
      : !inventoryReady ? <p className="report-message" role="status">{inventoryStatus === 'error' ? 'El inventario no está disponible.' : 'Cargando tus colecciones…'}</p>
      : inventoryStatus === 'refreshing' ? <p className="report-note" role="status">Actualizando inventario…</p> : null}

    {editorOpen && <section className="report-panel report-editor"><div className="report-section-heading"><h2>{draft.id ? 'Editar informe' : createMode === 'single' ? 'Configurar un grupo' : 'Crear varios informes'}</h2>
      <button type="button" onClick={() => setEditorOpen(false)}>Cerrar</button></div>
      <form onSubmit={save}>
        {!draft.id && <div className="report-editor-top"><label>Crear<select value={createMode} onChange={event => { setCreateMode(event.target.value as typeof createMode); setBatchValues([]); }}><option value="single">Un informe</option><option value="set">Uno por expansión (set)</option><option value="rarity">Uno por rareza</option></select></label>
          {createMode !== 'single' && <label>Usar informe como plantilla<select value={templateId} onChange={event => {
            const template = state.reports.find(report => report.id === event.target.value);
            setTemplateId(event.target.value); setBatchValues([]);
            setDraft(template ? { ...template, id: '', name: '', filters: reportFilters(template.filters) } : initialDraft());
          }}><option value="">Configurar filtros desde cero</option>{state.reports.map(report => <option key={report.id} value={report.id}>{report.name}</option>)}</select></label>}
        </div>}
        <div className="report-editor-top"><label>{createMode === 'single' ? 'Nombre del informe' : 'Prefijo del nombre (opcional)'}<input required={createMode === 'single'} maxLength={100} placeholder={createMode === 'single' ? 'Ej. Mini Shiny · Sword & Shield' : 'Vacío: usar el nombre de la expansión o rareza'} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
          <label>Condición para valorar<select value={draft.condition} onChange={event => setDraft(current => ({ ...current, condition: event.target.value as ConditionKey }))}>{REPORT_CONDITIONS.map(condition => <option key={condition}>{condition}</option>)}</select></label></div>
        <label className="report-group-field">Grupo (opcional)<input aria-label="Grupo (opcional)" aria-describedby="report-group-hint" maxLength={100} list="report-group-names" placeholder="Ej. Scarlet & Violet · Sets" value={draft.group ?? ''} onChange={event => setDraft(current => ({ ...current, group: event.target.value }))} /><span id="report-group-hint" className="report-note">Sin nombre de grupo se organiza automáticamente por tipo y serie.{createMode !== 'single' ? ' Los nuevos informes compartirán este grupo.' : ''}</span></label>
        <details className={`report-shared-filters${createMode === 'single' ? ' report-shared-filters--single' : ''}`} open={createMode === 'single' || !templateId || undefined}>
          <summary>Filtros compartidos<span>{draft.filters.series?.join(', ') || 'Elige una serie'} · {sharedOwnership ? 'Colecciones comunes' : 'Colecciones'}: {draftCollections.length ? draftCollections.join(', ') : 'Todo el inventario'}</span></summary>
          <div className="report-shared-filter-body">
        <div className="report-url-import"><button type="button" onClick={() => importFiltersFromUrl(window.location.href)}>Usar filtros del catálogo</button>
          <label>O pega un enlace con filtros<input type="text" placeholder="https://pokedashboard-eight.vercel.app/?series=…" value={importUrl} onChange={event => setImportUrl(event.target.value)} /></label>
          <button type="button" disabled={!importUrl.trim()} onClick={() => importFiltersFromUrl(importUrl)}>Cargar enlace</button></div>
        <div className="report-filter-grid">{REPORT_FIELDS.map(field => {
          if (field.key === createMode) return null;
          const options = field.key === 'series' ? hierarchy.map(serie => serie.name) : draftCards.flatMap(card => {
            if (field.key === 'pokedexRegion') {
              const region = card.pokedexRegion || (card.nationalPokedexNumbers?.length ? getRegionForPokedexNumber(card.nationalPokedexNumbers[0]) : null);
              return region ? [region] : [];
            }
            const value = card[field.property]; return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
          });
          return <ReportFilterPicker key={field.key} label={field.label} options={options} included={draft.filters[field.key]} excluded={draft.filters[excludeParam(field.key)]}
            onChange={(included, excluded) => updateFilters({ [field.key]: included, [excludeParam(field.key)]: excluded })} />;
        })}</div>
        <div className="report-editor-top report-price-fields"><label>Buscar cartas<input type="search" value={draft.filters.search ?? ''} onChange={event => updateFilters({ search: event.target.value })} placeholder="Nombre, número o expansión" /></label>
          <label>Precio mínimo (USD)<input type="number" min="0" step="0.01" value={draft.filters.priceMin ?? ''} onChange={event => updateFilters({ priceMin: event.target.value })} /></label>
          <label>Precio máximo (USD)<input type="number" min="0" step="0.01" value={draft.filters.priceMax ?? ''} onChange={event => updateFilters({ priceMax: event.target.value })} /></label></div>
        {sharedOwnership ? <p className="report-note">Tenemos / Faltan usa la selección común del panel superior: {draftCollections.length ? draftCollections.join(', ') : 'Todo el inventario'}. Cambia las colecciones allí para aplicarlas a todos los informes.</p>
          : <><ReportFilterPicker label="Colecciones para Tenemos / Faltan" options={availableCollections.map(collection => collection.name)} included={draft.filters.collections} allowExclude={false} noOptionsLabel="No hay colecciones de inventario disponibles." onChange={included => updateFilters({ collections: included })} />
          <p className="report-note">Sin elegir colecciones se usa todo tu inventario. Una colección incluye sus subcolecciones. Se cuenta una carta por variante; tener varias copias no multiplica el valor. Los filtros de ocultar cartas poseídas no reducen el total.</p></>}
          </div>
        </details>
        {createMode !== 'single' && <div className="report-batch">
          <h3>{createMode === 'set' ? 'Expansiones a crear' : 'Rarezas a crear'}</h3>
          <p className="report-note">Se crea un informe por opción elegida. El filtro de {createMode === 'set' ? 'expansión' : 'rareza'} se sustituye; los demás filtros, la condición y las colecciones se conservan. Puedes editar cada informe después.</p>
          <div className="report-batch-actions"><button type="button" disabled={!catalogReady || !batchOptions.length} onClick={() => setBatchValues(batchOptions)}>Seleccionar todas ({batchOptions.length})</button><button type="button" disabled={!batchValues.length} onClick={() => setBatchValues([])}>Limpiar selección</button></div>
          <ReportFilterPicker key={createMode} label={createMode === 'set' ? 'Elegir expansiones' : 'Elegir rarezas'} options={batchOptions} included={batchValues} allowExclude={false} emptyLabel="Ninguna seleccionada" defaultOpen onChange={included => setBatchValues(included)} />
          {batchPlan.length > 0 && <div className="report-table-scroll"><table className="report-table report-batch-preview"><caption>Vista previa · {batchNew.length} {batchNew.length === 1 ? 'informe nuevo' : 'informes nuevos'}{batchExisting ? ` · ${batchExisting} ya existente${batchExisting === 1 ? '' : 's'}` : ''}</caption><thead><tr><th>Informe</th><th>Cartas</th><th>Estado</th></tr></thead><tbody>{batchPlan.map(report => <tr key={report.name}><th scope="row">{report.name}</th><td>{catalogReady ? report.cards : '…'}</td><td>{report.existingId ? 'Ya existe · se omitirá' : report.cards ? 'Nuevo' : catalogReady ? 'Nuevo · sin cartas' : 'Cargando…'}</td></tr>)}</tbody></table></div>}
        </div>}
        <div className="report-editor-footer"><span role="status">{!draft.filters.series?.length ? 'Elige una serie para comenzar.' : !catalogReady ? catalog.error || 'Cargando vista previa…' : createMode !== 'single' ? `${batchNew.length} ${batchNew.length === 1 ? 'informe nuevo' : 'informes nuevos'}${batchExisting ? ` · ${batchExisting} ya existente${batchExisting === 1 ? '' : 's'}` : ''}` : `${draftPreview.length} cartas · ${draftValuation.unpriced === draftPreview.length && draftPreview.length ? 'Sin precio' : money(draftValuation.value)}${draftValuation.unpriced ? ` · ${draftValuation.unpriced} sin precio` : ''}`}</span>
          <button type="submit" className="report-primary" disabled={createMode !== 'single' && (!catalogReady || !batchNew.length)}>{createMode !== 'single' ? `Crear ${batchNew.length} ${batchNew.length === 1 ? 'informe' : 'informes'}` : draft.id ? 'Guardar cambios' : 'Agregar a comparaciones'}</button></div>
      </form>
    </section>}
    {catalog.key === catalogKey && catalog.error && <p className="report-message report-message--error" role="alert">{catalog.error}</p>}
    {state.reports.length > 0 && <>
      <BuyingPanel entries={buyingEntries} active={analysisActive} ready={historyReady} loading={analysisActive && !historyReady && !historyPaused && !(history.key === historyKey && history.error) && !(catalog.key === catalogKey && catalog.error)} error={(history.key === historyKey ? history.error : '') || (catalog.key === catalogKey ? catalog.error : '')}
        onAutomatic={setAnalysisActive}
        scope={analysisScope} onScope={setAnalysisScope} group={buyingGroup} onGroup={setBuyingGroup} days={analysisDays} onDays={setAnalysisDays} inventoryReady={inventoryReady}
        onAnalyze={() => { setAnalysisActive(true); setHistoryPaused(false); setRefreshTick(tick => tick + 1); }} order={listOrder} onOrder={changeOrder} onShow={showReport}
        onClear={() => void clearAnalysisCache()} clearing={clearingCache} paused={historyPaused} cacheInfo={cacheInfo} cacheBytes={cacheBytes} onExport={exportAnalysis} />
      <section className="report-panel"><div className="report-section-heading"><h2>Lista de comparación <span className="report-count">{state.reports.length}</span></h2>
        <button type="button" disabled={!catalogReady} onClick={exportCsv}><Download size={15} /> Exportar CSV</button></div>
        <div className="report-list-tools"><label>Agrupar por<select aria-label="Agrupar por" value={grouping} onChange={event => commit({ ...state, grouping: event.target.value as ReportGrouping })}><option value="auto">Tipo y serie / grupo propio</option><option value="series">Serie</option><option value="custom">Grupos propios</option><option value="none">Sin agrupar</option></select></label>
          <label>Ordenar seleccionados por<select aria-label="Ordenar por" value={listOrder} onChange={event => changeOrder(event.target.value as BuyingOrder)}><option value="saved">Orden guardado</option><option value="priority">Prioridad de compra</option><option value="signal-asc">Señal (A–Z)</option><option value="signal-desc">Señal (Z–A)</option></select></label>
          <form className="report-move-group" onSubmit={event => { event.preventDefault(); if (state.selectedIds.length && groupName.trim() && commit(assignReportGroup(state, state.selectedIds, groupName))) { setGroupName(''); setNotice('Se actualizó el grupo de los informes seleccionados.'); } }}>
            <label>Grupo para los seleccionados<input maxLength={100} list="report-group-names" placeholder="Nombre del grupo" value={groupName} onChange={event => setGroupName(event.target.value)} /></label>
            <button type="submit" disabled={!state.selectedIds.length || !groupName.trim()}>Agrupar seleccionados ({state.selectedIds.length})</button>
            <button type="button" disabled={!state.selectedIds.length} onClick={() => { if (commit(assignReportGroup(state, state.selectedIds, ''))) setNotice('Los informes seleccionados vuelven a su agrupación automática.'); }}>Quitar grupo propio</button>
          </form>
        </div>
        <p className="report-note">El orden se aplica solo a los informes seleccionados; los demás y los grupos conservan su posición. Pliega un grupo para acortar la lista o marca su casilla para comparar todos sus informes.</p>
        {!catalogReady && !catalog.error && <p className="report-note" role="status">Cargando cartas y precios…</p>}
        <div className="report-table-scroll"><table className="report-table"><thead><tr><th>Comparar / Informe</th>{GROUPS.map(key => <th key={key}>{GROUP_LABELS[key]}<small>Cartas · USD</small></th>)}<th>Acciones</th></tr></thead>
          <tbody>{reportSections.map(section => {
            const selectedCount = section.reports.filter(report => state.selectedIds.includes(report.id)).length;
            const collapsed = collapsedGroups.has(section.key);
            return <Fragment key={section.key}>{grouping !== 'none' && <tr className="report-list-group"><th colSpan={5} scope="rowgroup"><div className="report-list-group-heading">
              <button type="button" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expandir' : 'Plegar'} ${section.name}`} onClick={() => setCollapsedGroups(current => { const next = new Set(current); if (next.has(section.key)) next.delete(section.key); else next.add(section.key); return next; })}>{collapsed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}{section.name}<span className="report-count">{section.reports.length}</span></button>
              <label><input type="checkbox" aria-label={`Comparar grupo ${section.name}`} aria-checked={selectedCount > 0 && selectedCount < section.reports.length ? 'mixed' : selectedCount === section.reports.length} checked={selectedCount === section.reports.length} ref={node => { if (node) node.indeterminate = selectedCount > 0 && selectedCount < section.reports.length; }} onChange={event => commit({ ...state, selectedIds: event.target.checked ? [...new Set([...state.selectedIds, ...section.reports.map(report => report.id)])] : state.selectedIds.filter(id => !section.reports.some(report => report.id === id)) })} />{selectedCount}/{section.reports.length} seleccionados</label>
            </div></th></tr>}{(!collapsed || grouping === 'none') && section.reports.map(report => {
              const { index, ...result } = resultsById.get(report.id)!;
              return <tr key={result.report.id}>
            <th scope="row"><label className="report-row-name"><input type="checkbox" aria-label={`Comparar ${result.report.name}`} checked={state.selectedIds.includes(result.report.id)} onChange={event => commit({ ...state, selectedIds: event.target.checked ? [...state.selectedIds, result.report.id] : state.selectedIds.filter(id => id !== result.report.id) })} />
              <i style={{ background: REPORT_COLORS[index % REPORT_COLORS.length] }} />{result.report.name}</label><small>{result.report.filters.series?.join(', ')} · {result.report.condition}</small>
              {analysisActive && historyReady && (buyingGroup === 'total' || inventoryReady) && analysisById.has(result.report.id) && <BuyingBadge analysis={analysisById.get(result.report.id)!} />}</th>
            {GROUPS.map(key => {
              const valuation = reportValue(result.groups[key], result.report.condition);
              const ready = catalogReady && (key === 'total' || inventoryReady);
              return <td key={key}>{ready ? <><strong>{result.groups[key].length}</strong><span>{valuation.unpriced === result.groups[key].length && valuation.unpriced > 0 ? 'Sin precio' : money(valuation.value)}</span>
                {valuation.unpriced > 0 && <small>{valuation.unpriced} sin precio</small>}</> : <span aria-label="Datos no disponibles">—</span>}</td>;
            })}<td><div className="report-row-actions"><button type="button" onClick={() => showReport(result.report.id)} aria-controls={`report-${result.report.id}`}>Ver tendencia</button>
              <button type="button" aria-label={`Crear varios desde ${result.report.name}`} title="Usar como plantilla para crear varios" onClick={() => openBatch(result.report)}><Copy size={16} /></button>
              <button type="button" aria-label={`Editar ${result.report.name}`} onClick={() => editReport(result.report)}><Pencil size={16} /></button>
              <button type="button" aria-label={`Eliminar ${result.report.name}`} onClick={() => { if (commit({ ...state, reports: state.reports.filter(report => report.id !== result.report.id), selectedIds: state.selectedIds.filter(id => id !== result.report.id) })) setDeleted(result.report); }}><Trash2 size={16} /></button></div></td>
          </tr>;
            })}</Fragment>;
          })}</tbody></table></div>
      </section>
      <section className="report-panel"><div className="report-section-heading"><h2>Tendencias por informe <span className="report-count">{selectedReports.length}</span></h2><div className="report-chart-controls">
        <label>Período<select aria-label="Período" value={days} onChange={event => setDays(Number(event.target.value))}><option value={0}>Todo el historial</option><option value={365}>1 año</option><option value={180}>6 meses</option><option value={90}>3 meses</option></select></label>
        <label>Escala<select aria-label="Escala" value={percent ? 'percent' : 'usd'} onChange={event => setPercent(event.target.value === 'percent')}><option value="usd">Valor USD</option><option value="percent">Cambio %</option></select></label>
      </div></div>
        {catalog.key === catalogKey && catalog.error ? <p className="report-note">La tendencia estará disponible cuando se pueda cargar el catálogo.</p>
          : history.error && history.key === historyKey ? <p className="report-message report-message--error" role="alert">{history.error}</p>
          : !selectedReports.length ? <p className="report-chart-empty">Marca los informes de la lista que quieras comparar.</p>
          : historyPaused ? <p className="report-note">Caché limpiada. Pulsa Actualizar o Analizar informes para cargar de nuevo.</p>
          : !historyReady ? <p className="report-message" role="status">Cargando historial de precios…</p> : null}
        <p className="report-note">El historial representa las cartas del grupo actual y usa el último precio conocido entre observaciones. Tenemos / Faltan reflejan tu inventario actual, sin reconstruir compras anteriores. El cambio % parte del primer precio del período elegido.</p>
      </section>
      {selectedReports.map(result => <section className="report-panel report-selected" key={result.report.id} id={`report-${result.report.id}`} aria-labelledby={`report-${result.report.id}-title`}>
        <div className="report-section-heading"><h2 id={`report-${result.report.id}-title`}>{result.report.name}</h2><div className="report-actions">
          <button type="button" aria-label={`Editar informe ${result.report.name}`} onClick={() => editReport(result.report)}><Pencil size={15} /> Editar informe</button>
          <a href={`/${reportQuery({ ...result.report.filters, collections: result.collectionNames }, result.report.condition)}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir cartas</a>
        </div></div>
        <p className="report-note">{sharedOwnership ? 'Colecciones comunes' : 'Colecciones'}: {result.collectionNames.length ? result.collectionNames.join(', ') : 'Todo el inventario'}</p>
        <div className="report-detail-charts">{GROUPS.map((key, index) => {
          const valuation = reportValue(result.groups[key], result.report.condition);
          const ready = catalogReady && (key === 'total' || inventoryReady);
          const chart = <><ReportChart compact days={days} percent={percent} lines={[{ id: key, name: GROUP_LABELS[key], color: REPORT_COLORS[index], points: result.curves[key].points }]} />
            <p className="report-note">Historial de {result.curves[key].covered}/{result.curves[key].total} cartas{result.curves[key].covered < result.curves[key].total ? ' · Valor parcial' : ''}</p></>;
          return <article key={key}><h3>{GROUP_LABELS[key]}</h3>
          {ready && <p className="report-group-value"><strong>{result.groups[key].length} cartas</strong><span>{valuation.unpriced === result.groups[key].length && valuation.unpriced > 0 ? 'Sin precio' : money(valuation.value)}</span></p>}
          {key !== 'total' && !inventoryReady ? <p className="report-chart-empty">{session ? 'Esperando el inventario.' : 'Inicia sesión para ver esta gráfica.'}</p>
            : !historyReady ? <p className="report-chart-empty">{history.error || catalog.error ? 'Historial no disponible.' : 'Cargando historial…'}</p>
            : analysisActive && ready ? <ChartBuyingAnalysis analysis={result.analyses[key]} days={analysisDays} label={GROUP_LABELS[key]}>{chart}</ChartBuyingAnalysis> : chart}
          {ready && valuation.unpriced > 0 && <p className="report-note">{valuation.unpriced} cartas sin precio actual.</p>}
        </article>;
        })}</div>
        {analysisActive && historyReady && inventoryReady && <BuyingCardList cards={result.groups.missing} condition={result.report.condition} history={history.data.get(result.report.condition) ?? new Map()} days={analysisDays} stale={cacheInfo.stale} />}
      </section>)}
      {selectedReports.length > 0 && <details className="report-panel report-overlay">
        <summary>Comparar grupos en una sola gráfica</summary>
        <div className="report-overlay-body"><div className="report-chart-controls">
          <label>Grupo<select aria-label="Grupo" value={group} onChange={event => setGroup(event.target.value as Group)}>{GROUPS.map(key => <option key={key} value={key}>{GROUP_LABELS[key]}</option>)}</select></label>
        </div>
          {!historyReady ? <p className="report-chart-empty">{history.error || catalog.error ? 'Historial no disponible.' : 'Cargando historial…'}</p>
            : !comparison.length ? <p className="report-chart-empty">El inventario debe estar disponible para comparar este grupo.</p>
            : <ReportChart days={days} percent={percent} lines={comparison.map(result => ({ id: result.report.id, name: result.report.name, color: REPORT_COLORS[results.findIndex(item => item.report.id === result.report.id) % REPORT_COLORS.length], points: result.curves[group].points }))} />}
          {historyReady && comparison.map(result => <p className="report-note" key={result.report.id}>{result.report.name}: historial de {result.curves[group].covered}/{result.curves[group].total} cartas{result.curves[group].covered < result.curves[group].total ? ' · Valor parcial: faltan cartas sin historial.' : ''}</p>)}
        </div>
      </details>}
    </>}
    {deleted && <div className="report-message">Se eliminó «{deleted.name}». <button type="button" onClick={() => { if (commit({ ...state, reports: [...state.reports, deleted], selectedIds: [...state.selectedIds, deleted.id] })) setDeleted(null); }}>Deshacer</button></div>}
    {!state.reports.length && !editorOpen && <div className="report-panel report-empty"><ChartNoAxesCombined size={40} /><h2>Tu primera comparación</h2><p>Crea grupos como Mini Shiny, Ultra Rare Pokémon o Ultra Rare Trainers y guárdalos aquí.</p><button type="button" onClick={() => { setDraft(initialDraft()); setCreateMode('single'); setEditorOpen(true); }}>Configurar un informe</button></div>}
    <div className="report-backup-actions"><button type="button" disabled={!state.reports.length} onClick={() => download(JSON.stringify(state, null, 2), 'pokedashboard-informes.json', 'application/json')}><Download size={15} /> Exportar configuración</button>
      <label className="report-import-label">Importar configuración<input type="file" accept="application/json,.json" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        try {
          const incoming = parseReports(JSON.parse(await file.text()));
          const reports = [...state.reports, ...incoming.reports.filter(report => !state.reports.some(existing => existing.id === report.id))];
          const ownershipCollections = incoming.ownershipCollections !== undefined && (!state.reports.length || state.ownershipCollections === undefined) ? incoming.ownershipCollections : state.ownershipCollections;
          commit({ ...state, ownershipCollections, grouping: state.grouping ?? incoming.grouping, reports, selectedIds: [...new Set([...state.selectedIds, ...incoming.selectedIds])] });
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo importar el archivo.'); }
      }} /></label></div>
    <datalist id="report-group-names">{groupNames.map(name => <option key={name} value={name} />)}</datalist>
  </main></div>;
};
