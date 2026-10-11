import { useMemo, useState } from 'react';
import type { Card, ConditionKey } from '../../types/dashboard';
import type { HistoryPoint } from '../../utils/reportHistory';
import { aggregateReportHistory } from '../../utils/reportHistory';
import { analyzeBuying, compareBuyingPriority } from '../../utils/reportAnalysis';
import { money, signedPercent } from '../../utils/reportDisplay';
import { BuyingBadge } from './BuyingPanel';

export const BuyingCardList = ({ cards, condition, history, days, stale }: {
  cards: Card[]; condition: ConditionKey; history: Map<string, HistoryPoint[]>; days: number; stale: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const opportunities = useMemo(() => !open || stale ? [] : cards.map(card => ({ card, analysis: analyzeBuying(aggregateReportHistory([card], history), days) }))
    .filter(entry => entry.analysis.score !== null).sort((a, b) => compareBuyingPriority(a.analysis, b.analysis)), [open, stale, cards, history, days]);
  return <details className="report-buying-method" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Cartas que faltan: cuáles revisar primero</summary>
    {open && <><p>Hasta 10 cartas ordenadas por prioridad · {condition} · {days} días. Cada variante se analiza con su propia impresión y condición.</p>
      {stale ? <p>Actualiza el historial para recuperar las puntuaciones.</p> : !opportunities.length ? <p>No hay cartas con historial reciente suficiente para asignarles prioridad.</p> : <div className="report-table-scroll"><table className="report-table report-buying-table"><thead><tr><th>Carta</th><th>Señal</th><th>Último precio</th><th>Sobre mínimo</th><th>30 días</th></tr></thead>
        <tbody>{opportunities.slice(0, 10).map(({ card, analysis }) => <tr key={card.id}><th scope="row"><a href={`https://www.tcgplayer.com/product/${card.productId}?Language=English&Condition=${encodeURIComponent(condition)}`} target="_blank" rel="noreferrer">{card.name} · {card.number}</a><small>{card.setName} · {card.printing} · ID {card.productId}</small></th>
          <td><BuyingBadge analysis={analysis} /></td><td>{money(analysis.current!)}</td><td>{signedPercent(analysis.aboveMinimum)}</td><td>{signedPercent(analysis.change30)}</td></tr>)}</tbody></table></div>}
      {opportunities.length < cards.length && <p>{cards.length - opportunities.length} cartas excluidas de la clasificación por datos insuficientes, antiguos o movimientos extremos.</p>}
    </>}
  </details>;
};
