import React, { useEffect, useMemo, useState } from "react";
import { useCardContext } from "../../context/CardContext";
import type { Card } from "../../types/dashboard";
import {
  buildPriceExplorerUrl,
  chunkProductIds,
  PRICE_EXPLORER_MAX_IDS,
} from "../../utils/priceExplorer";

export const PriceExplorerButton: React.FC = () => {
  const { visibleCards } = useCardContext();
  const [batchIndex, setBatchIndex] = useState(0);

  const batches = useMemo(() => {
    const productIds = visibleCards
      .filter((card): card is Card => !("isPlaceholder" in card))
      .map((card) => card.productId);

    return chunkProductIds(productIds);
  }, [visibleCards]);

  useEffect(() => {
    setBatchIndex(0);
  }, [batches.length, visibleCards]);

  const selectedBatch = batches[batchIndex] || batches[0] || [];
  const explorerUrl = buildPriceExplorerUrl(selectedBatch);
  const totalIds = batches.reduce((total, batch) => total + batch.length, 0);
  const batchStart = batchIndex * PRICE_EXPLORER_MAX_IDS + 1;
  const batchEnd = batchStart + selectedBatch.length - 1;

  if (visibleCards.filter((card) => !('isPlaceholder' in card)).length >= 500) {
    return null;
  }

  return (
    <div className="price-explorer-batch">
      {batches.length > 1 && (
        <label className="price-explorer-batch__selector">
          <span>Price Explorer batch</span>
          <select
            value={batchIndex}
            onChange={(event) => setBatchIndex(Number(event.target.value))}
            aria-label="Select filtered card batch for Price Explorer"
          >
            {batches.map((batch, index) => {
              const start = index * PRICE_EXPLORER_MAX_IDS + 1;
              const end = start + batch.length - 1;
              return (
                <option value={index} key={`${start}-${end}`}>
                  {start}-{end} of {totalIds}
                </option>
              );
            })}
          </select>
        </label>
      )}
      {explorerUrl ? (
        <a
          className="price-explorer-btn sidebar-action-btn"
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Explore price history for filtered products ${batchStart}-${batchEnd} of ${totalIds}`}
        >
          <span className="sidebar-action-btn__icon" aria-hidden="true">↗</span>
          <span className="sidebar-action-btn__label">Explore prices</span>
          <span className="sidebar-action-btn__count" aria-label={`${totalIds} products`}>{totalIds}</span>
        </a>
      ) : (
        <button
          className="price-explorer-btn sidebar-action-btn"
          type="button"
          disabled
          title="No visible cards have a TCGplayer product ID"
        >
          <span className="sidebar-action-btn__icon" aria-hidden="true">↗</span>
          <span className="sidebar-action-btn__label">Explore prices</span>
          <span className="sidebar-action-btn__count" aria-label="0 products">0</span>
        </button>
      )}
    </div>
  );
};
