import type { ReportCurve } from './reportHistory';

export const ANALYSIS_VERSION = 1;
const DAY = 86400000;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const change = (current: number, previous: number) => previous > 0 ? (current / previous - 1) * 100 : null;
export type BuyingSignal = 'valley' | 'near-low' | 'falling' | 'rebound' | 'high' | 'middle' | 'flat' | 'volatile' | 'insufficient' | 'stale' | 'empty';
export type BuyingOrder = 'saved' | 'priority' | 'signal-asc' | 'signal-desc';
export const SIGNAL_LABELS: Record<BuyingSignal, string> = {
  valley: 'Valle estable', 'near-low': 'Cerca de mínimos', falling: 'Sigue cayendo', rebound: 'En subida',
  high: 'Zona alta', middle: 'Zona intermedia', flat: 'Precio estable', volatile: 'Movimiento extremo', insufficient: 'Datos insuficientes', stale: 'Datos antiguos', empty: 'Sin cartas',
};
export type BuyingAnalysis = {
  score: number | null; signal: BuyingSignal; reasons: string[]; asOf: string | null;
  current: number | null; minimum: number | null; maximum: number | null; minimumDate: string | null;
  aboveMinimum: number | null; drawdown: number | null; change7: number | null; change30: number | null;
  position: number | null; coverage: number; freshCoverage: number; spanDays: number; historyDays: number; weeklyTrend: number | null;
  components: { low: number; discount: number; drawdown: number; stability: number } | null;
};

/** A review priority, not a probability of a future bottom. All comparisons use one
 * fixed basket and relative prices, so expensive collections do not win by size. */
export const analyzeBuying = (curve: ReportCurve, days = 365, today = new Date().toISOString().slice(0, 10)): BuyingAnalysis => {
  const asOfDay = Date.parse(today);
  const allPoints = [...new Map(curve.points.filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
    Number.isFinite(Date.parse(p.date)) && Date.parse(p.date) <= asOfDay && Number.isFinite(p.price) && p.price >= 0).map(p => [p.date, p])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
  const points = allPoints.filter(p => Date.parse(p.date) >= asOfDay - days * DAY);
  const latest = points[points.length - 1];
  const result: BuyingAnalysis = {
    score: null, signal: 'insufficient', reasons: [], asOf: latest?.date ?? null, current: latest?.price ?? null,
    minimum: null, maximum: null, minimumDate: null, aboveMinimum: null, drawdown: null, change7: null, change30: null,
    position: null, weeklyTrend: null, historyDays: allPoints.length ? (Date.parse(allPoints[allPoints.length - 1].date) - Date.parse(allPoints[0].date)) / DAY : 0, coverage: curve.total ? curve.covered / curve.total : 0,
    freshCoverage: curve.total ? (curve.freshCovered ?? curve.covered) / curve.total : 0, spanDays: 0, components: null,
  };
  if (!curve.total) return { ...result, signal: 'empty', reasons: ['No hay cartas en este grupo.'] };
  const observations = curve.observationDates ? curve.observationDates.filter(date => date >= (points[0]?.date ?? today) && Date.parse(date) <= asOfDay).length : points.length;
  if (!latest || observations < 20) return { ...result, reasons: ['Se necesitan al menos 20 observaciones y 60 días de historial.'] };
  const spanDays = (Date.parse(latest.date) - Date.parse(points[0].date)) / DAY;
  result.spanDays = spanDays;
  const minimum = points.reduce((a, b) => a.price <= b.price ? a : b);
  const maximum = Math.max(...points.map(p => p.price));
  result.minimum = minimum.price; result.minimumDate = minimum.date; result.maximum = maximum;
  result.aboveMinimum = change(latest.price, minimum.price);
  result.drawdown = change(latest.price, maximum);
  // Calendar-day references: don't mistake 30 sparse observations for 30 days.
  const previous = (ago: number) => { const earlier = points.filter(p => Date.parse(p.date) <= Date.parse(latest.date) - ago * DAY); return earlier[earlier.length - 1]; };
  result.change7 = previous(7) ? change(latest.price, previous(7)!.price) : null;
  result.change30 = previous(30) ? change(latest.price, previous(30)!.price) : null;
  if (asOfDay - Date.parse(latest.date) > 7 * DAY || result.freshCoverage < .8) {
    return { ...result, signal: 'stale', reasons: ['Menos del 80% del grupo tiene precios observados en los últimos 7 días, o el último dato es antiguo.'] };
  }
  if (spanDays < 60 || result.coverage < .8 || latest.price <= 0 || result.change30 === null) {
    return { ...result, reasons: [spanDays < 60 ? 'Historial menor a 60 días; evita comparar un lanzamiento con sets maduros.' : result.coverage < .8 ? 'Historial de menos del 80% de las cartas; el valor agregado es parcial.' : 'No hay una referencia de precio positiva suficiente.'] };
  }
  if (Math.abs(result.change30) > 50) return { ...result, signal: 'volatile', reasons: ['Movimiento mayor al 50% en 30 días: verifica las cartas y sus precios antes de asignar prioridad automática.'] };
  const average = (from: number, to: number) => {
    const values = points.filter(p => { const ago = (Date.parse(latest.date) - Date.parse(p.date)) / DAY; return ago >= from && ago < to; });
    return values.length ? values.reduce((sum, p) => sum + p.price, 0) / values.length : null;
  };
  const currentWeek = average(0, 7), priorWeek = average(7, 14);
  result.weeklyTrend = currentWeek !== null && priorWeek !== null ? change(currentWeek, priorWeek) : null;
  const range = maximum - minimum.price;
  const position = range > 0 ? clamp((latest.price - minimum.price) / range) : .5;
  result.position = position;
  const flat = range / maximum < .01;
  const nearLow = position <= .25 && (result.aboveMinimum === null || result.aboveMinimum <= 15);
  const falling = ((result.change7 ?? 0) < -2 || (result.weeklyTrend ?? 0) < -2) && result.change30 < -5;
  const rising = (result.change7 ?? 0) > 3 || result.change30 > 10;
  const stable = Math.abs(result.weeklyTrend ?? Infinity) <= 2 && (result.change7 ?? -Infinity) >= -1 && !rising && (Date.parse(latest.date) - Date.parse(minimum.date)) / DAY >= 5;
  result.signal = flat ? 'flat' : falling ? 'falling' : nearLow && stable ? 'valley' : nearLow ? 'near-low' : position >= .75 ? 'high' : rising ? 'rebound' : 'middle';
  const sorted = points.map(p => p.price).sort((a, b) => a - b);
  const median = (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
  const components = {
    low: flat ? 15 : 45 * (1 - position),
    discount: 20 * clamp(median > 0 ? (1 - latest.price / median) / .2 : 0),
    drawdown: 15 * clamp(-(result.drawdown ?? 0) / 30),
    stability: flat ? 10 : falling ? 0 : stable ? 20 : (result.change7 ?? 0) > 3 ? 5 : 10,
  };
  result.components = Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Math.round(v)])) as typeof components;
  result.score = Object.values(result.components).reduce((a, b) => a + b, 0);
  if (falling) result.score = Math.min(result.score, 59);
  if (flat) result.score = Math.min(result.score, 40);
  if (result.historyDays < 90) result.score = Math.min(result.score, 69);
  else if (result.historyDays < 180) result.score = Math.min(result.score, 79);
  result.reasons = [
    result.aboveMinimum === null ? 'El mínimo del período es cero; compara también el rango.' : `${result.aboveMinimum.toFixed(1)}% sobre el mínimo del período.`,
    `${Math.abs(result.drawdown ?? 0).toFixed(1)}% por debajo del máximo.`,
    falling ? 'La caída continúa en 7 y 30 días; aún no confirma un valle.' : result.signal === 'valley' ? 'Zona baja con variación semanal contenida; revisa ofertas individuales.' : rising ? 'Ya hay subida reciente; evita perseguir el rebote.' : 'Compara con el mínimo y con el movimiento reciente antes de decidir.',
    ...(result.historyDays < 180 ? ['Historial corto: prioridad limitada hasta acumular más datos.'] : []),
  ];
  return result;
};

export const compareBuyingPriority = (a: BuyingAnalysis, b: BuyingAnalysis) =>
  (b.score ?? -1) - (a.score ?? -1) || (a.aboveMinimum ?? Infinity) - (b.aboveMinimum ?? Infinity);

/** Alphabetical signal groups; ties retain descending priority within each signal. */
export const compareBuyingAnalysis = (a: BuyingAnalysis, b: BuyingAnalysis, order: BuyingOrder) => {
  if (order === 'saved') return 0;
  if (order === 'signal-asc' || order === 'signal-desc') {
    const bySignal = SIGNAL_LABELS[a.signal].localeCompare(SIGNAL_LABELS[b.signal], 'es', { sensitivity: 'base' });
    if (bySignal) return bySignal * (order === 'signal-asc' ? 1 : -1);
  }
  return compareBuyingPriority(a, b);
};
