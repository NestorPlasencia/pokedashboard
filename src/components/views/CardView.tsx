import React, { useMemo } from "react";
import { Card } from "../../types/dashboard";
import { useCardContext } from "../../context/CardContext";
import { getCardPriceBreakdown, getCollectionTotalQuantity } from "../../utils/utils";

const formatCurrency = (value: number) => {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
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
        alt={`Imagen ${variantName} de la carta ${card.name}`}
        aria-label={`Imagen ${variantName} de la carta ${card.name}`}
        data-executed="false"
      />
      <div className="card-tags">
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
      {collectionFilter.selectedCollections.length > 0 && <div className="counters">
        {collectionFilter.selectedCollections.map((collection, i) => {
          const col = card.collections?.find(c => c.name === collection);
          const quantity = col ? getCollectionTotalQuantity(col) : 0;
          if (quantity > 0) {
            return <span className={`counter ${quantity >= 3 ? 'counter--high' : ''}`} key={i}>{quantity}</span>
          }
          return null;
        })}
      </div>}
      {missingToLimit > 0 && collectionFilter.enabled && (
        <div
          className="missing-box"
          title={`Faltan ${missingToLimit} para el límite`}
          aria-label={`Faltan ${missingToLimit} para el límite`}
        >
          {missingToLimit}
        </div>
      )}
      </div>
  );
};

export const CardView = React.memo(CardViewComponent);
