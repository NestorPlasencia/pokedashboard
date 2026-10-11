import { useId, useState } from 'react';
import type { HistoryPoint } from '../../utils/reportHistory';
import { money } from '../../utils/reportDisplay';
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });

export type ChartLine = { id: string; name: string; points: HistoryPoint[]; color: string };
export const ReportChart = ({ lines, percent = false, days = 0, compact = false }: { lines: ChartLine[]; percent?: boolean; days?: number; compact?: boolean }) => {
  const titleId = useId();
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const latest = Math.max(0, ...lines.flatMap(line => line.points.length ? [Date.parse(line.points[line.points.length - 1].date)] : []));
  const cutoff = days ? latest - days * 86400000 : 0;
  const plotted = lines.flatMap(line => {
    const points = line.points.filter(point => Date.parse(point.date) >= cutoff);
    if (!points.length || (percent && points[0].price === 0)) return [];
    return [{ ...line, points: points.map(point => ({ ...point, price: percent ? (point.price / points[0].price - 1) * 100 : point.price })) }];
  });
  if (!plotted.length) return <div className="report-chart-empty">No hay historial suficiente para este período.</div>;
  const minDate = Math.min(...plotted.map(line => Date.parse(line.points[0].date)));
  const maxDate = Math.max(...plotted.map(line => Date.parse(line.points[line.points.length - 1].date)));
  let minimum = Infinity, maximum = -Infinity;
  for (const line of plotted) for (const point of line.points) { minimum = Math.min(minimum, point.price); maximum = Math.max(maximum, point.price); }
  const padding = Math.max((maximum - minimum) * .15, Math.abs(maximum) * .025, percent ? 1 : .5);
  const low = minimum - padding, high = maximum + padding;
  const width = compact ? 450 : 900, left = compact ? 66 : 76, right = 16, top = 18, bottom = 230;
  const plotWidth = width - left - right;
  const x = (date: string) => left + (Date.parse(date) - minDate) / Math.max(maxDate - minDate, 86400000) * plotWidth;
  const y = (price: number) => bottom - (price - low) / (high - low) * (bottom - top);
  const format = (price: number) => percent ? `${price.toFixed(1)}%` : money(price);
  const focused = hoverDay === null ? null : plotted.map(line => {
    // Never extend a curve before its first observation or beyond its displayed range.
    if (hoverDay < Date.parse(line.points[0].date) || hoverDay > Date.parse(line.points[line.points.length - 1].date)) return null;
    const index = Math.min(line.points.length - 1, Math.max(0, Math.round((hoverDay - Date.parse(line.points[0].date)) / 86400000)));
    return { line, point: line.points[index] };
  }).filter(item => item !== null);
  return <div className="report-chart">
    <svg viewBox={`0 0 ${width} 268`} role="img" aria-labelledby={titleId}
      onPointerLeave={() => setHoverDay(null)}
      onPointerMove={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, ((event.clientX - bounds.left) / bounds.width * width - left) / plotWidth));
        setHoverDay(minDate + Math.round((maxDate - minDate) * ratio / 86400000) * 86400000);
      }}>
      <title id={titleId}>{plotted.map(line => `${line.name}: ${format(line.points[0].price)} a ${format(line.points[line.points.length - 1].price)}`).join('. ')}</title>
      {[0, 1, 2, 3, 4].map(index => {
        const value = low + (high - low) * index / 4;
        return <g key={index}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="report-chart-grid" />
          <text x={left - 9} y={y(value) + 4} textAnchor="end">{percent ? `${value.toFixed(0)}%` : `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}</text></g>;
      })}
      {(compact ? [0, .5, 1] : [0, .25, .5, .75, 1]).map(ratio => <text key={ratio} x={left + plotWidth * ratio} y={255} textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}>
        {dateLabel(new Date(minDate + (maxDate - minDate) * ratio).toISOString().slice(0, 10))}</text>)}
      {plotted.map(line => <g key={line.id}>
        <path d={line.points.map((point, index) => `${index ? 'L' : 'M'}${x(point.date).toFixed(2)},${y(point.price).toFixed(2)}`).join(' ')} stroke={line.color} strokeWidth="2.7" fill="none" strokeLinejoin="round" />
        <circle cx={x(line.points[line.points.length - 1].date)} cy={y(line.points[line.points.length - 1].price)} r="3.5" fill={line.color} />
      </g>)}
      {focused?.length ? <line x1={x(focused[0].point.date)} x2={x(focused[0].point.date)} y1={top} y2={bottom} className="report-chart-cursor" /> : null}
    </svg>
    <div className="report-chart-legend" aria-live="polite">
      {focused?.length ? <span>{dateLabel(focused[0].point.date)}</span> : null}
      {(focused ?? plotted.map(line => ({ line, point: line.points[line.points.length - 1] }))).map(({ line, point }) =>
        <span key={line.id}><i style={{ background: line.color }} />{line.name} <strong>{format(point.price)}</strong></span>)}
    </div>
    {plotted.length === 1 && <div className="report-chart-extrema">
      <span>Mínimo <strong>{format(minimum)}</strong></span><span>Máximo <strong>{format(maximum)}</strong></span>
    </div>}
  </div>;
};
