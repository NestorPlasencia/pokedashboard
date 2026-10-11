import { ArrowDown, ArrowUp, ArrowUpDown, Download, RefreshCw, Trash2 } from 'lucide-react';
import { ANALYSIS_VERSION, SIGNAL_LABELS, type BuyingAnalysis, type BuyingOrder } from '../../utils/reportAnalysis';
import { money, signedPercent } from '../../utils/reportDisplay';
import type { SavedReport } from '../../services/reports';

export type BuyingEntry = { report: SavedReport; analysis: BuyingAnalysis; cards: number };
export const BuyingBadge = ({ analysis }: { analysis: BuyingAnalysis }) => <span className={`report-buying-badge report-buying-badge--${analysis.signal}`}>
  {analysis.score !== null && <strong>{analysis.score}<small>/100</small></strong>}{SIGNAL_LABELS[analysis.signal]}</span>;

export const BuyingDetails = ({ analysis }: { analysis: BuyingAnalysis }) => <div className="report-buying-reasons">
  {analysis.reasons.map(reason => <p key={reason}>{reason}</p>)}
  {analysis.minimum !== null && <p>Mínimo: {money(analysis.minimum)} ({analysis.minimumDate}) · Máximo: {money(analysis.maximum!)}</p>}
  <p>Historial: {(analysis.coverage * 100).toFixed(0)}% · Precios recientes: {(analysis.freshCoverage * 100).toFixed(0)}% · {analysis.spanDays} días en la ventana, {analysis.historyDays} disponibles.</p>
  {analysis.components && <p>Puntos: zona baja {analysis.components.low}/45 · descuento frente a mediana {analysis.components.discount}/20 · caída desde máximo {analysis.components.drawdown}/15 · estabilidad {analysis.components.stability}/20.</p>}
</div>;

export const BuyingPanel = ({ entries, active, ready, loading, error, scope, onScope, group, onGroup, days, onDays,
  inventoryReady, onAnalyze, order, onOrder, onShow, onClear, clearing, paused, cacheInfo, cacheBytes, onExport, onAutomatic }: {
  entries: BuyingEntry[]; active: boolean; ready: boolean; loading: boolean; error: string;
  scope: 'all' | 'selected'; onScope: (value: 'all' | 'selected') => void;
  group: 'total' | 'missing'; onGroup: (value: 'total' | 'missing') => void;
  days: number; onDays: (value: number) => void; inventoryReady: boolean;
  onAnalyze: () => void; order: BuyingOrder; onOrder: (value: BuyingOrder) => void; onShow: (id: string) => void; onClear: () => void;
  clearing: boolean; paused: boolean; cacheInfo: { storedAt: number | null; stale: boolean; cached: number; fetched: number };
  cacheBytes: number | null; onExport: () => void;
  onAutomatic: (value: boolean) => void;
}) => {
  const valid = ready && active && !paused && (group === 'total' || inventoryReady);
  const freshness = cacheInfo.storedAt ? new Date(cacheInfo.storedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : null;
  return <section className="report-panel report-buying" aria-labelledby="report-buying-title">
    <div className="report-section-heading"><div><h2 id="report-buying-title">Prioridad de compra</h2><p className="report-note">Compara las señales del grupo elegido. La puntuación indica qué revisar antes.</p></div>
      <button type="button" className="report-primary" disabled={loading || clearing} onClick={onAnalyze}><RefreshCw size={15} />{loading ? 'Analizando…' : active && !paused ? 'Recalcular' : 'Analizar informes'}</button></div>
    <div className="report-list-tools">
      <label>Informes a analizar<select aria-label="Informes a analizar" value={scope} onChange={e => onScope(e.target.value as typeof scope)}><option value="all">Todos los informes</option><option value="selected">Solo seleccionados</option></select></label>
      <label>Objetivo de compra<select aria-label="Objetivo de compra" value={group} onChange={e => onGroup(e.target.value as typeof group)}><option value="missing">Faltan</option><option value="total">Total</option></select></label>
      <label>Ventana de análisis<select aria-label="Ventana de análisis" value={days} onChange={e => onDays(Number(e.target.value))}><option value={365}>1 año</option><option value={180}>6 meses</option><option value={90}>3 meses</option></select></label>
      <label>Ordenar seleccionados por<select aria-label="Ordenar análisis" value={order} onChange={event => onOrder(event.target.value as BuyingOrder)}><option value="saved">Orden guardado</option><option value="priority">Prioridad de compra</option><option value="signal-asc">Señal (A–Z)</option><option value="signal-desc">Señal (Z–A)</option></select></label>
      <button type="button" disabled={!valid} onClick={onExport}><Download size={15} /> Exportar análisis</button>
    </div>
    <label className="report-buying-auto"><input type="checkbox" checked={active} onChange={event => onAutomatic(event.target.checked)} />Analizar nuevos informes automáticamente</label>
    <p className="report-note">Reglas fijas v{ANALYSIS_VERSION} · fecha de referencia UTC: {new Date().toISOString().slice(0, 10)}. En «Todos los informes», cada informe nuevo se incorpora al cargar sus precios. Estas preferencias se guardan por cuenta.</p>
    <p className="report-note">Se ordenan solo los informes seleccionados para comparar, usando {group === 'missing' ? 'Faltan' : 'Total'}.{order === 'signal-asc' || order === 'signal-desc' ? ' Dentro de cada señal, la mayor puntuación aparece primero.' : ''}</p>
    {group === 'missing' && !inventoryReady && <p className="report-message">Necesitas el inventario para analizar Faltan. Puedes elegir Total para revisar todo el grupo.</p>}
    {error ? <p className="report-message report-message--error" role="alert">{error}</p> : loading ? <p className="report-message" role="status">Cargando el historial y calculando la prioridad…</p> : !active || paused ? <p className="report-note">Pulsa Analizar informes para calcular la clasificación con el historial disponible.</p> : null}
    {valid && <div className="report-table-scroll"><table className="report-table report-buying-table"><caption>Clasificación de {group === 'missing' ? 'Faltan' : 'Total'} · últimos {days} días · {entries.length} informes</caption>
      <thead><tr><th>Informe / {order === 'priority' ? 'prioridad' : 'orden'}</th><th aria-sort={order === 'signal-asc' ? 'ascending' : order === 'signal-desc' ? 'descending' : 'none'}><button type="button" className="report-sort-heading" onClick={() => onOrder(order === 'signal-asc' ? 'signal-desc' : 'signal-asc')} aria-label={`Ordenar por señal ${order === 'signal-asc' ? 'Z a A' : 'A a Z'}`}>Señal{order === 'signal-asc' ? <ArrowUp size={13} /> : order === 'signal-desc' ? <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</button></th><th>Sobre mínimo</th><th>Desde máximo</th><th>7 días</th><th>30 días</th><th>Detalle</th></tr></thead>
      <tbody>{entries.map((entry, index) => <tr key={entry.report.id}><th scope="row"><button type="button" className="report-text-button" onClick={() => onShow(entry.report.id)}>{entry.analysis.score === null ? '—' : index + 1}. {entry.report.name}</button><small>{entry.cards} cartas · {entry.report.condition}{entry.analysis.asOf ? ` · ${entry.analysis.asOf}` : ''}</small></th>
        <td><BuyingBadge analysis={entry.analysis} /></td><td>{signedPercent(entry.analysis.aboveMinimum)}</td><td>{signedPercent(entry.analysis.drawdown)}</td><td>{signedPercent(entry.analysis.change7)}</td><td>{signedPercent(entry.analysis.change30)}</td>
        <td><details><summary>Ver razones</summary><BuyingDetails analysis={entry.analysis} /></details></td></tr>)}</tbody></table>{!entries.length && <p className="report-note">Selecciona algún informe para analizarlo.</p>}</div>}
    <details className="report-buying-method"><summary>Cómo interpretar la puntuación</summary><p>Compara el precio con el rango y la mediana del período, la caída desde máximos y la estabilidad de las últimas dos semanas. «Valle estable» exige zona baja y al menos 5 días desde el mínimo. Una caída que continúa queda limitada a 59 puntos; un historial menor a 90 días, a 69; menor a 180, a 79.</p>
      <p>Sin 60 días, 20 observaciones y 80% de cobertura reciente, o con un movimiento mayor al 50% en 30 días, no se asigna prioridad automática. Los umbrales son una regla orientativa; no identifican con certeza el mínimo futuro.</p>
      <p>El grupo usa tu inventario actual y una carta por variante. Un precio agregado bajo puede depender de una sola carta cara. Revisa cada oferta, condición, impresión y envío; este análisis no dispone de volumen de ventas ni de anuncios de reimpresión.</p></details>
    <div className="report-buying-cache"><div><strong>Caché del historial</strong><p className="report-note">Se reutiliza durante 15 minutos, incluso al recargar. {cacheBytes !== null ? `${(cacheBytes / 1024 / 1024).toFixed(1)} MB guardados. ` : ''}{freshness ? `Consulta más antigua: ${freshness}. ${cacheInfo.cached} productos reutilizados · ${cacheInfo.fetched} consultados.` : 'Todavía no hay una consulta completa.'}</p>
      {cacheInfo.stale && <p className="report-message report-message--error">Copia guardada: falló la actualización. Se muestran las gráficas y se suspende la puntuación hasta actualizar.</p>}</div>
      <button type="button" disabled={clearing} onClick={onClear}><Trash2 size={15} />{clearing ? 'Limpiando…' : 'Limpiar caché del análisis'}</button></div>
    <p className="report-note">Hasta 100 MB o 2.500 productos. Los resultados se recalculan al cambiar los filtros o el inventario; limpiar la caché conserva informes y preferencias.</p>
  </section>;
};
