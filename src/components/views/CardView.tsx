import { TrendingUp } from "lucide-react";
import { WishlistCardButton } from "../ui/Wishlists";
import { useWishlists } from "../../context/WishlistsContext";
import React, { useMemo } from "react";
import { Card } from "../../types/dashboard";
import { useCardContext } from "../../context/CardContext";
import { getCardPriceBreakdown, getCollectionTotalQuantity } from "../../utils/utils";
import { buildPriceExplorerUrl } from "../../utils/priceExplorer";

const formatCurrency = (value: number) => {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
};

const CardViewComponent: React.FC<{
  card: Card;
}> = ({ card }) => {

  const { collectionFilter, sets, trendByProductId, viewOptions, trendLoading } = useCardContext();
  const wishlists = useWishlists();
  const showWishlistButton = wishlists.canToggle(card);
  // The control only takes over the "Missing" slot inside the wishlist view.
  // Browsing the catalog, Missing keeps its corner even with a subcollection selected.
  const wishlistTakesMissingSlot = showWishlistButton && wishlists.viewing;
  const trend = card.productId ? trendByProductId.get(card.productId) : undefined;
  const trendStartDate = trend?.points.reduce<string | null>((earliest, point) => !earliest || point.date < earliest ? point.date : earliest, null) ?? null;

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

  const priceExplorerUrl = useMemo(
    () => buildPriceExplorerUrl([card.productId]),
    [card.productId]
  );

  const setSymbol = useMemo(() => {
    const byId = sets.find((set) => set.id === card.setId);
    if (byId?.images?.symbol || byId?.symbolImage) {
      return byId.images?.symbol || byId.symbolImage || "";
    }

    const byName = sets.find((set) => set.name === card.setName);
    return byName?.images?.symbol || byName?.symbolImage || "";
  }, [sets, card.setId, card.setName]);

  return (
    <div className={`card card-view-card${viewOptions.displayMode.includes('trend') ? ' card-view-card--trend' : ''}`}>
      <img
        loading="lazy"
        className={card.shadow ? 'shadow' : ''}
        src={card.image || ''}
        alt={`${variantName} image of ${card.name}`}
        aria-label={`${variantName} image of ${card.name}`}
        data-executed="false"
      />
      {viewOptions.displayMode.includes('trend') && <div className="card-trend-card-info">
        <span className="card-trend-card-info__set" title={card.setName}>{setSymbol && <img src={setSymbol} alt="" className="card-trend-card-info__symbol" onError={(event) => event.currentTarget.classList.add('is-hidden')} />}<span>{card.setName}</span></span>
        <span className="card-trend-card-info__number">#{card.number}</span>
        {nearMintPrice !== null && <div className="card-price-container card-price-container--relative card-trend-card-info__price">{card.productId ? <a href={`https://www.tcgplayer.com/product/${card.productId}?Language=English&Condition=Near+Mint`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{formatCurrency(nearMintPrice)}</a> : <strong>{formatCurrency(nearMintPrice)}</strong>}{priceBreakdown.length > 0 && <div className="card-price-tooltip"><div className="card-price-tooltip-title">{variantName}</div>{priceBreakdown.map((item, idx) => <div key={idx} className="tooltip-price-line"><span className="tooltip-condition-label">{item.condition}:</span><span className="tooltip-price-value">{item.price}</span></div>)}</div>}</div>}
        {ownedCounters.length > 0 && <span className="card-trend-card-info__inventory" aria-label="Owned quantities by selected collection"><span className="card-trend-card-info__inventory-label">Owned</span>{ownedCounters.map(({ collection, quantity }) => <span className={`card-trend-card-info__collection ${quantity >= 3 ? 'card-trend-card-info__collection--high' : ''}`} key={collection} title={`${collection}: ${quantity} owned`}>{quantity}</span>)}</span>}
        {!wishlistTakesMissingSlot && missingToLimit > 0 && collectionFilter.enabled && <span className="card-trend-card-info__missing">Missing {missingToLimit}</span>}
        {priceExplorerUrl && <a className="card-trend-card-info__prices-link" href={priceExplorerUrl} target="_blank" rel="noopener noreferrer" title={`Explore price history for ${card.name}`} onClick={(event) => event.stopPropagation()}><TrendingUp size={11} aria-hidden="true" /> Prices</a>}
      </div>}
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
      {priceExplorerUrl && (
        <a
          className="card-price-explorer-link"
          href={priceExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Explore price history for ${card.name}`}
          aria-label={`Explore price history for ${card.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <TrendingUp size={12} aria-hidden="true" /> Prices
        </a>
      )}
      {viewOptions.displayMode.includes('trend') && <div className="card-trend" aria-label={trend ? `${trend.buyTimingLabel}, score ${trend.buyTimingScore ?? 'unavailable'}` : 'Trend loading'}>
        <div className="card-trend__header"><span><strong>{card.name}</strong> · {variantName}</span><span className={`card-trend__score card-trend__score--${getTimingTone(trend?.buyTimingScore ?? null)}`}>{trend?.buyTimingScore ?? '—'}/100</span></div>
        <div className={`card-trend__label card-trend__label--${getTimingTone(trend?.buyTimingScore ?? null)}`}>{trendLoading && !trend ? 'Loading trend…' : trend?.buyTimingLabel || 'No trend data'}</div>
        {trendLoading && !trend ? <div className="card-trend__empty">Loading trend…</div> : trend ? <TrendSparkline points={trend.points} xAxisScale={viewOptions.trendXAxisScale} timingScore={trend.buyTimingScore} /> : <div className="card-trend__empty">No trend data</div>}
        {trend && <div className="card-trend__footer"><span>{trendStartDate} → {trend.latest?.date ?? trend.points[trend.points.length - 1]?.date} · latest {trend.latest ? formatCurrency(trend.latest.price) : '—'}</span><span className="card-trend__legend"><i className="card-trend__legend-dot card-trend__legend-dot--good" />Good <i className="card-trend__legend-dot card-trend__legend-dot--fair" />Fair <i className="card-trend__legend-dot card-trend__legend-dot--bad" />Bad</span></div>}
      </div>}
      {showWishlistButton && <WishlistCardButton card={card} />}
      {!wishlistTakesMissingSlot && missingToLimit > 0 && collectionFilter.enabled && (
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

const getTimingTone = (score: number | null) => score === null ? 'unknown' : score >= 70 ? 'good' : score >= 40 ? 'fair' : 'bad';

const TrendSparkline: React.FC<{ points: { date: string; price: number; segment?: string }[]; xAxisScale: 'normal' | 'sectors'; timingScore: number | null }> = ({ points, xAxisScale, timingScore }) => {
  if (points.length < 2) return null;
  const orderedPoints = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const prices = orderedPoints.map(point => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const width = 720;
  const height = 360;
  const margin = { top: 22, right: 86, bottom: 38, left: 52 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const padding = Math.max((max - min) * 0.1, Math.max(max, 1) * 0.005);
  const domainMin = Math.max(0, min - padding);
  const domainMax = max + padding;
  const domainRange = domainMax - domainMin || 1;
  const timestamps = orderedPoints.map(point => new Date(`${point.date}T00:00:00`).getTime());
  const timeMin = Math.min(...timestamps);
  const timeMax = Math.max(...timestamps);
  const timeRange = timeMax - timeMin || 1;
  const guideDefinitions = [
    { segment: '6m_to_1y', label: '1 year' },
    { segment: '1m_to_6m', label: '6 months' },
    { segment: '1w_to_1m', label: '1 month' },
    { segment: 'latest_to_1w', label: '1 week' },
  ];
  const sectorGuides = guideDefinitions.flatMap(guide => {
    const pointIndex = orderedPoints.findIndex(point => point.segment === guide.segment);
    return pointIndex < 0 ? [] : [{ ...guide, timestamp: timestamps[pointIndex] }];
  }).filter((guide, index, guides) => guide.timestamp > timeMin && guide.timestamp < timeMax && guides.findIndex(candidate => candidate.timestamp === guide.timestamp) === index);
  const scaleBreaks = [timeMin, ...sectorGuides.map(guide => guide.timestamp), timeMax].sort((a, b) => a - b);
  const x = (timestamp: number) => {
    if (xAxisScale === 'sectors' && scaleBreaks.length > 2) {
      const intervalCount = scaleBreaks.length - 1;
      const intervalIndex = Math.min(intervalCount - 1, Math.max(0, scaleBreaks.findIndex((_, index) => index < intervalCount && timestamp <= scaleBreaks[index + 1])));
      const intervalStart = scaleBreaks[intervalIndex];
      const intervalEnd = scaleBreaks[intervalIndex + 1];
      const intervalProgress = (timestamp - intervalStart) / (intervalEnd - intervalStart || 1);
      return margin.left + ((intervalIndex + intervalProgress) / intervalCount) * chartWidth;
    }
    return margin.left + ((timestamp - timeMin) / timeRange) * chartWidth;
  };
  const y = (price: number) => margin.top + ((domainMax - price) / domainRange) * chartHeight;
  const path = orderedPoints.map((point, index) => `${index ? 'L' : 'M'} ${x(timestamps[index]).toFixed(2)} ${y(point.price).toFixed(2)}`).join(' ');
  const yTicks = Array.from({ length: 5 }, (_, index) => domainMin + (domainRange * index) / 4).reverse();
  const xTicks = xAxisScale === 'normal' ? Array.from({ length: 6 }, (_, index) => timeMin + (timeRange * index) / 5) : [];
  const formatDate = (timestamp: number) => new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short' }).format(new Date(timestamp));
  const finalPoint = orderedPoints[orderedPoints.length - 1];
  const finalX = x(timestamps[timestamps.length - 1]);
  const finalY = y(finalPoint.price);
  const finalLabelY = finalY < margin.top + 24 ? finalY + 17 : finalY - 9;

  return <div className="card-trend__chart-wrap">
      <svg className="card-trend__chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Price trend from $${min.toFixed(2)} to $${max.toFixed(2)}`}>
        {yTicks.map((tick, index) => <g key={`y-${tick}`}><line className="card-trend__grid-line" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />{index > 0 && <text className="card-trend__tick-label" x={margin.left - 9} y={y(tick) + 4} textAnchor="end">${tick.toFixed(0)}</text>}</g>)}
        {xTicks.map((tick) => <g key={`x-${tick}`}><line className="card-trend__grid-line card-trend__grid-line--vertical" x1={x(tick)} x2={x(tick)} y1={margin.top} y2={height - margin.bottom} /><text className="card-trend__tick-label" x={x(tick)} y={height - 10} textAnchor="middle">{formatDate(tick)}</text></g>)}
        {sectorGuides.map(({ segment, label, timestamp }) => { const position = x(timestamp); return <g key={`sector-${segment}`}><line className="card-trend__sector-line" x1={position} x2={position} y1={margin.top} y2={height - margin.bottom} /><text className="card-trend__sector-label" x={position + 5} y={margin.top + 12} transform={`rotate(-90 ${position + 5} ${margin.top + 12})`}>{label}</text></g>; })}
        <line className="card-trend__limit-line card-trend__limit-line--max" x1={margin.left} x2={width - margin.right} y1={y(max)} y2={y(max)} />
        <line className="card-trend__limit-line card-trend__limit-line--min" x1={margin.left} x2={width - margin.right} y1={y(min)} y2={y(min)} />
        <text className="card-trend__limit-label card-trend__limit-label--max" x={margin.left + 8} y={y(max) - 6}>${max.toFixed(2)}</text>
        <text className="card-trend__limit-label card-trend__limit-label--min" x={margin.left + 8} y={y(min) + 14}>${min.toFixed(2)}</text>
        <path className={`card-trend__line card-trend__line--${getTimingTone(timingScore)}`} d={path} />
        {orderedPoints.map((point, index) => <circle className={`card-trend__point card-trend__point--${getTimingTone(timingScore)}`} key={`${point.date}-${index}`} cx={x(timestamps[index])} cy={y(point.price)} r="4"><title>{point.date}: ${point.price.toFixed(2)}</title></circle>)}
        <circle className={`card-trend__final-point card-trend__final-point--${getTimingTone(timingScore)}`} cx={finalX} cy={finalY} r="5" />
        <text className="card-trend__final-label" x={finalX + 11} y={finalLabelY} textAnchor="start">${finalPoint.price.toFixed(2)}</text>
      </svg>
    </div>;
};

export const CardView = React.memo(CardViewComponent);
