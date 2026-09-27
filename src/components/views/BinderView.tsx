import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCardContext } from "../../context/CardContext";
import type { Card } from "../../types/dashboard";
import { SeriesStarter } from "./SeriesStarter";

type Turn = { from: number; direction: "next" | "previous" };

export const BinderView = () => {
  const { renderCards, seriesSelection, viewMode, viewOptions } = useCardContext();
  const cards = useMemo(
    () => renderCards.filter((card): card is Card => !('isPlaceholder' in card)),
    [renderCards]
  );
  const [columns, rows] = viewOptions.binderLayout.split('x').map(Number);
  const pocketsPerPage = columns * rows;
  const pageCount = Math.max(1, Math.ceil(cards.length / pocketsPerPage));
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const currentPage = Math.min(page, pageCount - 1);
  const isAwaitingSeries = viewMode.kind === 'catalog'
    && seriesSelection.included.length === 0
    && seriesSelection.excluded.length === 0;

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    if (!turn) return;
    const timeout = window.setTimeout(() => setTurn(null), 520);
    return () => window.clearTimeout(timeout);
  }, [turn]);

  useEffect(() => {
    if (!selectedCard) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCard(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCard]);

  const turnPage = (direction: Turn['direction']) => {
    if (turn) return;
    const target = currentPage + (direction === 'next' ? 1 : -1);
    if (target < 0 || target >= pageCount) return;
    setTurn({ from: currentPage, direction });
    setPage(target);
  };

  const renderPockets = (pageIndex: number, interactive: boolean) =>
    Array.from({ length: pocketsPerPage }, (_, position) => {
      const card = cards[pageIndex * pocketsPerPage + position];
      return (
        <div className="binder-pocket" key={position}>
          {card ? interactive ? (
            <button
              className="binder-pocket__card"
              type="button"
              onClick={() => setSelectedCard(card)}
              aria-label={`${card.name}, ${card.variant || 'Normal'}, ${card.setName} ${card.number}`}
              title={`${card.name} · ${card.setName} ${card.number}`}
            >
              <img loading="lazy" src={card.image} alt="" />
            </button>
          ) : <img className="binder-pocket__card" src={card.image} alt="" /> : null}
        </div>
      );
    });

  const pageStyle = {
    '--binder-page': viewOptions.binderPageColor,
    '--binder-sleeve': viewOptions.binderSleeveColor,
    '--binder-columns': columns,
  } as CSSProperties;

  if (cards.length === 0) {
    return <div className="binder-view binder-view--empty">
      {isAwaitingSeries ? <SeriesStarter /> : <p>No cards match your current filters.</p>}
    </div>;
  }

  return (
    <div className="binder-view" style={pageStyle}>
      <div className="binder-view__toolbar" aria-label="Binder pages">
        <button type="button" onClick={() => turnPage('previous')} disabled={currentPage === 0 || Boolean(turn)} aria-label="Previous binder page">
          <ChevronLeft size={18} aria-hidden="true" /> Previous
        </button>
        <span aria-live="polite">Page {currentPage + 1} of {pageCount}</span>
        <button type="button" onClick={() => turnPage('next')} disabled={currentPage >= pageCount - 1 || Boolean(turn)} aria-label="Next binder page">
          Next <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="binder-view__stage">
        <div className="binder-page">
          <div className="binder-page__rings" aria-hidden="true"><i /><i /><i /></div>
          <div className="binder-page__pockets">{renderPockets(currentPage, true)}</div>
        </div>
        {turn && <div className={`binder-page binder-page--turn-${turn.direction}`} aria-hidden="true">
          <div className="binder-page__rings"><i /><i /><i /></div>
          <div className="binder-page__pockets">{renderPockets(turn.from, false)}</div>
        </div>}
      </div>
      <p className="binder-view__count">{cards.length.toLocaleString()} cards · {viewOptions.binderLayout} pockets per page</p>
      {selectedCard && <div className="binder-card-dialog" role="presentation" onClick={() => setSelectedCard(null)}>
        <div className="binder-card-dialog__content" role="dialog" aria-modal="true" aria-label={`${selectedCard.name} card`} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="binder-card-dialog__close" onClick={() => setSelectedCard(null)} aria-label="Close card details"><X size={20} /></button>
          <img src={selectedCard.image} alt={`${selectedCard.name} card`} />
          <div><strong>{selectedCard.name}</strong><span>{selectedCard.variant || 'Normal'} · {selectedCard.setName} #{selectedCard.number}</span></div>
        </div>
      </div>}
    </div>
  );
};
