import type { ReactNode } from 'react';
import type { BuyingAnalysis } from '../../utils/reportAnalysis';
import { signedPercent } from '../../utils/reportDisplay';
import { BuyingBadge, BuyingDetails } from './BuyingPanel';

export const ChartBuyingAnalysis = ({ analysis, days, label, children }: {
  analysis: BuyingAnalysis; days: number; label: string; children: ReactNode;
}) => <section className="report-chart-buying" aria-label={`Análisis de ${label}`}>
  <div className="report-chart-buying-heading"><BuyingBadge analysis={analysis} /><span>Últimos {days} días</span></div>
  {children}
  <dl className="report-chart-buying-metrics">
    <div><dt>Sobre mínimo</dt><dd>{signedPercent(analysis.aboveMinimum)}</dd></div>
    <div><dt>Desde máximo</dt><dd>{signedPercent(analysis.drawdown)}</dd></div>
    <div><dt>7 días</dt><dd>{signedPercent(analysis.change7)}</dd></div>
    <div><dt>30 días</dt><dd>{signedPercent(analysis.change30)}</dd></div>
  </dl>
  <details><summary>Ver razones</summary><BuyingDetails analysis={analysis} /></details>
</section>;
