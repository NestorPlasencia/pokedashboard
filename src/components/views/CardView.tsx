import React, { useMemo } from "react";
import { Card } from "../../types/dashboard";
import { useCardContext } from "../../context/CardContext";
import { getCardPriceBreakdown, getCollectionTotalQuantity } from "../../utils/utils";

const formatCurrency = (value: number) => {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
};

const CardViewComponent: React.FC<{
  card: Card;
}> = ({ card }) => {

  const { collectionFilter, sets } = useCardContext();

  const variantName = card.variant || 'Normal';

  // Memoize owned sum calculation
  const ownedSum = useMemo(() => {
    return (card.collections || [])
      .filter(c => collectionFilter.selectedCollections.includes(c.name))
      .reduce((sum, c) => sum + getCollectionTotalQuantity(c), 0);
  }, [card.collections, collectionFilter.selectedCollections]);

  const ownedCounters = useMemo(() => {
    return collectionFilter.selectedCollections
      .map((collection) => {
        const match = card.collections?.find((item) => item.name === collection);
        return {
          collection,
          quantity: match ? getCollectionTotalQuantity(match) : 0
        };
      })
      .filter((item) => item.quantity > 0);
  }, [card.collections, collectionFilter.selectedCollections]);

  // Memoize missing to limit
  const missingToLimit = useMemo(() => {
    return Math.max(0, collectionFilter.limit - ownedSum);
  }, [collectionFilter.limit, ownedSum]);

  // Get Near Mint price (primary display price)
  const nearMintPrice = useMemo(() => {
    return card.prices?.["Near Mint"] ?? null;
  }, [card.prices]);

  const priceBreakdown = useMemo(() => {
    return getCardPriceBreakdown(card);
  }, [card]);

  const setSymbol = useMemo(() => {
    const byId = sets.find((set) => set.id === card.setId);
    if (byId?.images?.symbol || byId?.symbolImage) {
      return byId.images?.symbol || byId.symbolImage || "";
    }

    const byName = sets.find((set) => set.name === card.setName);
    return byName?.images?.symbol || byName?.symbolImage || "";
  }, [sets, card.setId, card.setName]);

  return (
    <div className="card card-view-card">
      <img
        loading="lazy"
        className={card.shadow ? 'shadow' : ''}
        src={card.image || ''}
        alt={`${variantName} image of ${card.name}`}
        aria-label={`${variantName} image of ${card.name}`}
        data-executed="false"
      />
      <div className="card-tags">
        <div
          className="variant-label card-variant-label card-name-label card-name-tag"
          title={card.name}
          aria-label={`Card name ${card.name}`}
        >
          {card.name}
        </div>
        <div className="variant-label card-variant-label">
          {variantName}
        </div>
        {setSymbol && (
          <div className="variant-label card-variant-label card-icon-tag" title="Set icon" aria-label="Set icon">
            <img
              src={setSymbol}
              alt=""
              className="card-set-symbol"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.classList.add('is-hidden');
              }}
            />
          </div>
        )}
        <div
          className="variant-label card-variant-label card-number-label"
          title={card.number}
          aria-label={`Card number ${card.number}`}
        >
          {card.number}
        </div>
        <div
          className="variant-label card-variant-label card-set-label"
          title={card.setName}
          aria-label={`Set ${card.setName}`}
        >
          {card.setName}
        </div>
      </div>
      {nearMintPrice !== null && (
        <div className="prices">
          <div className="card-price-container card-price-container--relative">
            {card.productId ? (
              <a
                href={`https://www.tcgplayer.com/product/${card.productId}?Language=English&Condition=Near+Mint`}
                target="_blank"
                rel="noopener noreferrer"
                className="card-price-link"
                onClick={(e) => e.stopPropagation()}
              >
                {formatCurrency(nearMintPrice)}
              </a>
            ) : (
              <span className="card-price-value">{formatCurrency(nearMintPrice)}</span>
            )}
            {priceBreakdown.length > 0 && (
              <div className="card-price-tooltip">
                <div className="card-price-tooltip-title">
                  {variantName}
                </div>
                {priceBreakdown.map((item, idx) => (
                  <div key={idx} className="tooltip-price-line">
                    <span className="tooltip-condition-label">{item.condition}:</span>
                    <span className="tooltip-price-value">{item.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {ownedCounters.length > 0 && <div className="counters" aria-label="Owned quantities by selected collection">
        {ownedCounters.map(({ collection, quantity }) => (
          <span
            className={`counter ${quantity >= 3 ? 'counter--high' : ''}`}
            key={collection}
            title={`${collection}: ${quantity} owned`}
            aria-label={`${collection}: ${quantity} owned`}
          >
            {quantity}
          </span>
        ))}
      </div>}
      {missingToLimit > 0 && collectionFilter.enabled && (
        <div
          className="missing-box"
          title={`${missingToLimit} ${missingToLimit === 1 ? 'copy' : 'copies'} missing to reach the target`}
          aria-label={`${missingToLimit} ${missingToLimit === 1 ? 'copy' : 'copies'} missing to reach the target`}
        >
          <span className="missing-box__label">Missing</span>
          <strong className="missing-box__value">{missingToLimit}</strong>
        </div>
      )}
      </div>
  );
};

export const CardView = React.memo(CardViewComponent);
