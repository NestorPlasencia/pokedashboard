import { Check, CircleHelp, TriangleAlert, X } from 'lucide-react';
import type { CheckResult, PriceAlert } from '../../utils/scannerCheck';
import { conditionCountsText, priceAlertText } from '../../utils/scannerCheck';

const VISIBLE_ROWS = 3;

/** Whether the scanned card is in the collection, over the video so no scrolling is needed. */
export function ScannerCheckResult({ result, alert, limit }: { result: CheckResult; alert: PriceAlert | null; limit: number | null }) {
  const { verdict, candidates } = result;
  const [first] = candidates;
  const single = candidates.length === 1;
  const total = candidates.reduce((sum, candidate) => sum + candidate.copies, 0);
  // With several possible cards, the ones in the collection are what the answer turns on.
  const listed = [...candidates].sort((a, b) => Number(b.copies > 0) - Number(a.copies > 0)).slice(0, VISIBLE_ROWS);
  const hidden = candidates.length - listed.length;
  const title = single ? first.card.name : verdict === 'unclear' ? `${candidates.length} cartas posibles` : first.card.name;
  const detail = single ? `${first.card.setName} · ${first.card.number}`
    : verdict === 'absent' ? `Ninguna de las ${candidates.length} posibles`
      : verdict === 'held' ? `Las ${candidates.length} posibles están`
        : 'Revisa el número y el set';
  const unclearSingle = verdict === 'unclear' && single;
  return <div className={`scanner-camera__live scanner-check is-${verdict}${alert && alert.level !== 'unpriced' ? ' is-alert' : ''}`}>
    {alert && limit !== null && <p className="scanner-check__alert"><TriangleAlert size={16} aria-hidden="true" />{priceAlertText(alert, limit)}</p>}
    <div className="scanner-check__head">
      <img src={first.card.image} alt="" />
      <span><strong>{title}</strong><small>{detail}</small></span>
      <em>
        {verdict === 'held' ? <><Check size={16} aria-hidden="true" />Sí · {total}</>
          : verdict === 'absent' ? <><X size={16} aria-hidden="true" />No</>
            : <><CircleHelp size={16} aria-hidden="true" />Dudosa</>}
      </em>
    </div>
    {single && verdict === 'held' && <ul className="scanner-check__rows">
      {first.printings.map(entry => <li key={entry.printing}><span>{entry.printing}</span><b>{conditionCountsText(entry)}</b></li>)}
      {first.mixedPrintings && <li className="scanner-check__note">La cámara no distingue la impresión: compara el sello de tu carta.</li>}
    </ul>}
    {unclearSingle && <ul className="scanner-check__rows"><li className="scanner-check__note">{first.tracked ? 'Lectura dudosa: revisa el número y el set.' : 'Esta carta no tiene ID de producto y no se puede comprobar.'}</li></ul>}
    {!single && verdict !== 'absent' && <ul className="scanner-check__rows">
      {listed.map(candidate => <li key={candidate.key}>
        <span>{candidate.card.setName} · {candidate.card.number}</span>
        <b>{candidate.copies ? candidate.printings.map(entry => `${entry.printing}: ${conditionCountsText(entry)}`).join(' | ') : 'No está'}</b>
      </li>)}
      {hidden > 0 && <li className="scanner-check__note">y {hidden} más</li>}
    </ul>}
  </div>;
}
