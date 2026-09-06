import { TrendingUp } from "lucide-react";
import { WishlistCardButton } from "../ui/Wishlists";
import { useWishlists } from "../../context/WishlistsContext";
import React, { useMemo } from "react";
import { useCardContext } from "../../context/CardContext";
import type { Card } from "../../types/dashboard";
import { getCardPriceBreakdown, getCollectionTotalQuantity } from "../../utils/utils";
import { buildPriceExplorerUrl } from "../../utils/priceExplorer";

const formatCurrency = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const getTimingTone = (score: number | null) => score === null ? "unknown" : score >= 70 ? "good" : score >= 40 ? "fair" : "bad";

const TrendCardViewComponent: React.FC<{ card: Card }> = ({ card }) => {
  const { collectionFilter, sets, trendByProductId, viewOptions, trendLoading } = useCardContext();
  const wishlists = useWishlists();
  const showWishlistButton = wishlists.canToggle();
  // The control only replaces "Missing" inside the wishlist view; the catalog keeps it.
  const wishlistTakesMissingSlot = showWishlistButton && wishlists.viewing;
  const trend = card.productId ? trendByProductId.get(card.productId) : undefined;
  const variantName = card.variant || "Normal";
  const trendStartDate = trend?.points.reduce<string | null>((earliest, point) => !earliest || point.date < earliest ? point.date : earliest, null) ?? null;

  const ownedCounters = useMemo(() => collectionFilter.selectedCollections.map(collection => {
    const match = card.collections?.find(item => item.name === collection);
    return { collection, quantity: match ? getCollectionTotalQuantity(match) : 0 };
  }).filter(item => item.quantity > 0), [card.collections, collectionFilter.selectedCollections]);

  const ownedSum = ownedCounters.reduce((sum, item) => sum + item.quantity, 0);
  const missingToLimit = Math.max(0, collectionFilter.limit - ownedSum);
  const nearMintPrice = card.prices?.["Near Mint"] ?? null;
  const priceBreakdown = useMemo(() => getCardPriceBreakdown(card), [card]);
  const priceExplorerUrl = useMemo(() => buildPriceExplorerUrl([card.productId]), [card.productId]);
  const setSymbol = useMemo(() => {
    const set = sets.find(item => item.id === card.setId) || sets.find(item => item.name === card.setName);
    return set?.images?.symbol || set?.symbolImage || "";
  }, [sets, card.setId, card.setName]);

  return (
    <article className="trend-card-view">
      <img className={`trend-card-view__image${card.shadow ? " shadow" : ""}`} src={card.image || ""} alt={`${variantName} image of ${card.name}`} loading="lazy" />

      <aside className="trend-card-view__info">
        <span className="trend-card-view__set" title={card.setName}>
          {setSymbol && <img src={setSymbol} alt="" className="trend-card-view__symbol" onError={event => event.currentTarget.classList.add("is-hidden")} />}
          <span>{card.setName}</span>
        </span>
        <span className="trend-card-view__number">#{card.number}</span>
        {nearMintPrice !== null && <div className="card-price-container card-price-container--relative trend-card-view__price">
          {card.productId ? <a href={`https://www.tcgplayer.com/product/${card.productId}?Language=English&Condition=Near+Mint`} target="_blank" rel="noopener noreferrer">{formatCurrency(nearMintPrice)}</a> : <strong>{formatCurrency(nearMintPrice)}</strong>}
          {priceBreakdown.length > 0 && <div className="card-price-tooltip"><div className="card-price-tooltip-title">{variantName}</div>{priceBreakdown.map((item, index) => <div key={index} className="tooltip-price-line"><span className="tooltip-condition-label">{item.condition}:</span><span className="tooltip-price-value">{item.price}</span></div>)}</div>}
        </div>}
        {ownedCounters.length > 0 && <span className="trend-card-view__inventory"><span className="trend-card-view__inventory-label">Owned</span>{ownedCounters.map(({ collection, quantity }) => <span className={`trend-card-view__owned${quantity >= 3 ? " trend-card-view__owned--high" : ""}`} key={collection} title={`${collection}: ${quantity} owned`}>{quantity}</span>)}</span>}
        {!wishlistTakesMissingSlot && missingToLimit > 0 && collectionFilter.enabled && <span className="trend-card-view__missing">Missing {missingToLimit}</span>}
        {showWishlistButton && <WishlistCardButton card={card} />}
        {priceExplorerUrl && <a className="trend-card-view__prices" href={priceExplorerUrl} target="_blank" rel="noopener noreferrer"><TrendingUp size={11} aria-hidden="true" /> Prices</a>}
      </aside>

      <section className="trend-card-view__graph" aria-label={trend ? `${trend.buyTimingLabel}, score ${trend.buyTimingScore ?? "unavailable"}` : "Trend loading"}>
        <div className="card-trend__header"><span><strong>{card.name}</strong> · {variantName}</span><span className={`card-trend__score card-trend__score--${getTimingTone(trend?.buyTimingScore ?? null)}`}>{trend?.buyTimingScore ?? "—"}/100</span></div>
        <div className={`card-trend__label card-trend__label--${getTimingTone(trend?.buyTimingScore ?? null)}`}>{trendLoading && !trend ? "Loading trend…" : trend?.buyTimingLabel || "No trend data"}</div>
        {trendLoading && !trend ? <div className="card-trend__empty">Loading trend…</div> : trend ? <TrendChart points={trend.points} xAxisScale={viewOptions.trendXAxisScale} timingScore={trend.buyTimingScore} /> : <div className="card-trend__empty">No trend data</div>}
        {trend && <div className="card-trend__footer"><span>{trendStartDate} → {trend.latest?.date ?? trend.points[trend.points.length - 1]?.date} · latest {trend.latest ? formatCurrency(trend.latest.price) : "—"}</span><span className="card-trend__legend"><i className="card-trend__legend-dot card-trend__legend-dot--good" />Good <i className="card-trend__legend-dot card-trend__legend-dot--fair" />Fair <i className="card-trend__legend-dot card-trend__legend-dot--bad" />Bad</span></div>}
      </section>
    </article>
  );
};

const TrendChart: React.FC<{ points: { date: string; price: number; segment?: string }[]; xAxisScale: "normal" | "sectors"; timingScore: number | null }> = ({ points, xAxisScale, timingScore }) => {
  if (points.length < 2) return null;
  const orderedPoints = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const prices = orderedPoints.map(point => point.price);
  const min = Math.min(...prices); const max = Math.max(...prices);
  const width = 720; const height = 360; const margin = { top: 22, right: 86, bottom: 38, left: 52 };
  const chartWidth = width - margin.left - margin.right; const chartHeight = height - margin.top - margin.bottom;
  const padding = Math.max((max - min) * .1, Math.max(max, 1) * .005);
  const domainMin = Math.max(0, min - padding); const domainMax = max + padding; const domainRange = domainMax - domainMin || 1;
  const timestamps = orderedPoints.map(point => new Date(`${point.date}T00:00:00`).getTime());
  const timeMin = Math.min(...timestamps); const timeMax = Math.max(...timestamps); const timeRange = timeMax - timeMin || 1;
  const guideDefinitions = [{ segment: "6m_to_1y", label: "1 year" }, { segment: "1m_to_6m", label: "6 months" }, { segment: "1w_to_1m", label: "1 month" }, { segment: "latest_to_1w", label: "1 week" }];
  const sectorGuides = guideDefinitions.flatMap(guide => { const index = orderedPoints.findIndex(point => point.segment === guide.segment); return index < 0 ? [] : [{ ...guide, timestamp: timestamps[index] }]; }).filter((guide, index, guides) => guide.timestamp > timeMin && guide.timestamp < timeMax && guides.findIndex(candidate => candidate.timestamp === guide.timestamp) === index);
  const scaleBreaks = [timeMin, ...sectorGuides.map(guide => guide.timestamp), timeMax].sort((a, b) => a - b);
  const x = (timestamp: number) => {
    if (xAxisScale === "sectors" && scaleBreaks.length > 2) {
      const count = scaleBreaks.length - 1;
      const index = Math.min(count - 1, Math.max(0, scaleBreaks.findIndex((_, candidate) => candidate < count && timestamp <= scaleBreaks[candidate + 1])));
      const progress = (timestamp - scaleBreaks[index]) / (scaleBreaks[index + 1] - scaleBreaks[index] || 1);
      return margin.left + ((index + progress) / count) * chartWidth;
    }
    return margin.left + ((timestamp - timeMin) / timeRange) * chartWidth;
  };
  const y = (price: number) => margin.top + ((domainMax - price) / domainRange) * chartHeight;
  const path = orderedPoints.map((point, index) => `${index ? "L" : "M"} ${x(timestamps[index]).toFixed(2)} ${y(point.price).toFixed(2)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => domainMin + (domainRange * index) / 4).reverse();
  const xTicks = xAxisScale === "normal" ? Array.from({ length: 6 }, (_, index) => timeMin + (timeRange * index) / 5) : [];
  const formatDate = (timestamp: number) => new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(new Date(timestamp));
  const finalPoint = orderedPoints[orderedPoints.length - 1]; const finalX = x(timestamps[timestamps.length - 1]); const finalY = y(finalPoint.price); const finalLabelY = finalY < margin.top + 24 ? finalY + 17 : finalY - 9;
  const tone = getTimingTone(timingScore);

  return <div className="trend-card-view__chart-wrap"><svg className="card-trend__chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Price trend from $${min.toFixed(2)} to $${max.toFixed(2)}`}>
    {yTicks.map((tick, index) => <g key={`y-${tick}`}><line className="card-trend__grid-line" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />{index > 0 && <text className="card-trend__tick-label" x={margin.left - 9} y={y(tick) + 4} textAnchor="end">${tick.toFixed(0)}</text>}</g>)}
    {xTicks.map(tick => <g key={`x-${tick}`}><line className="card-trend__grid-line card-trend__grid-line--vertical" x1={x(tick)} x2={x(tick)} y1={margin.top} y2={height - margin.bottom} /><text className="card-trend__tick-label" x={x(tick)} y={height - 10} textAnchor="middle">{formatDate(tick)}</text></g>)}
    {sectorGuides.map(({ segment, label, timestamp }) => { const position = x(timestamp); return <g key={segment}><line className="card-trend__sector-line" x1={position} x2={position} y1={margin.top} y2={height - margin.bottom} /><text className="card-trend__sector-label" x={position + 5} y={margin.top + 12} transform={`rotate(-90 ${position + 5} ${margin.top + 12})`}>{label}</text></g>; })}
    <line className="card-trend__limit-line card-trend__limit-line--max" x1={margin.left} x2={width - margin.right} y1={y(max)} y2={y(max)} /><line className="card-trend__limit-line card-trend__limit-line--min" x1={margin.left} x2={width - margin.right} y1={y(min)} y2={y(min)} />
    <text className="card-trend__limit-label card-trend__limit-label--max" x={margin.left + 8} y={y(max) - 6}>${max.toFixed(2)}</text><text className="card-trend__limit-label card-trend__limit-label--min" x={margin.left + 8} y={y(min) + 14}>${min.toFixed(2)}</text>
    <path className={`card-trend__line card-trend__line--${tone}`} d={path} />{orderedPoints.map((point, index) => <circle className={`card-trend__point card-trend__point--${tone}`} key={`${point.date}-${index}`} cx={x(timestamps[index])} cy={y(point.price)} r="4"><title>{point.date}: ${point.price.toFixed(2)}</title></circle>)}
    <circle className={`card-trend__final-point card-trend__final-point--${tone}`} cx={finalX} cy={finalY} r="5" /><text className="card-trend__final-label" x={finalX + 11} y={finalLabelY}>${finalPoint.price.toFixed(2)}</text>
  </svg></div>;
};

export const TrendCardView = React.memo(TrendCardViewComponent);
