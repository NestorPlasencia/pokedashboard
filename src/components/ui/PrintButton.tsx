import { Printer } from "lucide-react";
import { useWishlists } from "../../context/WishlistsContext";
import React, { useMemo } from "react";
import { useCardContext } from "../../context/CardContext";
import { Card, TrendSeries } from "../../types/dashboard";
import { getCollectionTotalQuantity } from "../../utils/utils";

const escapeHtml = (value: string | number) => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);
const getTimingTone = (score: number | null | undefined) => score === null || score === undefined ? 'unknown' : score >= 70 ? 'good' : score >= 40 ? 'fair' : 'bad';

const buildPrintableTrendChart = (trend: TrendSeries, xAxisScale: 'normal' | 'sectors'): string => {
  if (trend.points.length < 2) return '<div class="no-trend">Not enough trend data</div>';
  const points = [...trend.points].sort((a, b) => a.date.localeCompare(b.date));
  const prices = points.map(point => point.price);
  const min = Math.min(...prices); const max = Math.max(...prices);
  const width = 620; const height = 250; const left = 48; const right = 72; const top = 18; const bottom = 18;
  const padding = Math.max((max - min) * 0.1, Math.max(max, 1) * 0.005);
  const domainMin = Math.max(0, min - padding); const domainMax = max + padding; const domainRange = domainMax - domainMin || 1;
  const times = points.map(point => new Date(`${point.date}T00:00:00`).getTime());
  const timeMin = Math.min(...times); const timeMax = Math.max(...times); const timeRange = timeMax - timeMin || 1;
  const guideDefinitions = [
    { segment: '6m_to_1y', label: '1 year' },
    { segment: '1m_to_6m', label: '6 months' },
    { segment: '1w_to_1m', label: '1 month' },
    { segment: 'latest_to_1w', label: '1 week' },
  ];
  const sectorGuides = guideDefinitions.flatMap(guide => {
    const pointIndex = points.findIndex(point => point.segment === guide.segment);
    return pointIndex < 0 ? [] : [{ ...guide, timestamp: times[pointIndex] }];
  }).filter((guide, index, guides) => guide.timestamp > timeMin && guide.timestamp < timeMax && guides.findIndex(candidate => candidate.timestamp === guide.timestamp) === index);
  const scaleBreaks = [timeMin, ...sectorGuides.map(guide => guide.timestamp), timeMax].sort((a, b) => a - b);
  const x = (time: number) => {
    if (xAxisScale === 'sectors' && scaleBreaks.length > 2) {
      const intervalCount = scaleBreaks.length - 1;
      const intervalIndex = Math.min(intervalCount - 1, Math.max(0, scaleBreaks.findIndex((_, index) => index < intervalCount && time <= scaleBreaks[index + 1])));
      const intervalStart = scaleBreaks[intervalIndex];
      const intervalEnd = scaleBreaks[intervalIndex + 1];
      const intervalProgress = (time - intervalStart) / (intervalEnd - intervalStart || 1);
      return left + ((intervalIndex + intervalProgress) / intervalCount) * (width - left - right);
    }
    return left + ((time - timeMin) / timeRange) * (width - left - right);
  };
  const y = (price: number) => top + ((domainMax - price) / domainRange) * (height - top - bottom);
  const finalPoint = points[points.length - 1]; const finalX = x(times[times.length - 1]); const finalY = y(finalPoint.price); const finalLabelY = finalY < top + 20 ? finalY + 15 : finalY - 7;
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(times[index]).toFixed(1)} ${y(point.price).toFixed(1)}`).join(' ');
  const yTicks = Array.from({ length: 5 }, (_, index) => domainMin + ((domainMax - domainMin) * index) / 4);
  const timingTone = getTimingTone(trend.buyTimingScore);
  return `<svg class="trend-chart timing-${timingTone}" viewBox="0 0 ${width} ${height}" role="img">
    ${yTicks.map((tick, index) => `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}"/>${index < yTicks.length - 1 ? `<text class="tick" x="${left - 7}" y="${y(tick) + 4}" text-anchor="end">$${tick.toFixed(0)}</text>` : ''}`).join('')}
    ${sectorGuides.map(guide => { const position = x(guide.timestamp); return `<line class="sector-line" x1="${position}" x2="${position}" y1="${top}" y2="${height - bottom}"/><text class="sector-label" x="${position + 5}" y="${top + 12}" transform="rotate(-90 ${position + 5} ${top + 12})">${escapeHtml(guide.label)}</text>`; }).join('')}
    <line class="limit max" x1="${left}" x2="${width - right}" y1="${y(max)}" y2="${y(max)}"/><line class="limit min" x1="${left}" x2="${width - right}" y1="${y(min)}" y2="${y(min)}"/>
    <text class="limit-label max-text" x="${left + 7}" y="${y(max) - 5}">$${max.toFixed(2)}</text><text class="limit-label min-text" x="${left + 7}" y="${y(min) + 13}">$${min.toFixed(2)}</text>
    <path class="trend-line" d="${path}"/>${points.map((point, index) => `<circle class="point" cx="${x(times[index])}" cy="${y(point.price)}" r="3"/>`).join('')}<circle class="final-point" cx="${finalX}" cy="${finalY}" r="4.5"/><text class="final-label" x="${finalX + 9}" y="${finalLabelY}" text-anchor="start">$${finalPoint.price.toFixed(2)}</text>
  </svg>`;
};

export const PrintButton: React.FC<{ busy?: boolean }> = ({ busy = false }) => {
  const wishlists = useWishlists();
  const { renderCards, collectionFilter, viewOptions, sets, trendByProductId, trendLoading } = useCardContext();

  const setSymbolById = useMemo(() => {
    return new Map(sets.map((set) => [set.id, set.images?.symbol || set.symbolImage || ""]));
  }, [sets]);

  const setSymbolByName = useMemo(() => {
    return new Map(sets.map((set) => [set.name, set.images?.symbol || set.symbolImage || ""]));
  }, [sets]);

  // Filter out placeholders - only print actual cards
  const actualCards = useMemo(() => {
    return renderCards.filter(card => !('isPlaceholder' in card)) as Card[];
  }, [renderCards]);

  // When printing a saved collection, group the cards by subcollection instead of
  // leaving them interleaved in whatever sort/search order was active on screen.
  const printGroups = wishlists.groupCards(actualCards);

  const getOwnedQuantity = (card: Card) => {
    return (card.collections || [])
      .filter(c => collectionFilter.selectedCollections.includes(c.name))
      .reduce((sum, c) => sum + getCollectionTotalQuantity(c), 0);
  };

  const getMissingToLimit = (card: Card) => {
    const owned = getOwnedQuantity(card);
    return Math.max(0, collectionFilter.limit - owned);
  };

  const getPrice = (card: Card) => {
    return card.prices?.["Near Mint"] ?? null;
  };

  // Wishlist print: suggest a target price the way real sellers price a buylist -
  // a "nice" round whole number a bit under market, not an exact percentage. Sellers
  // favor numbers ending in 0, then 5 - never cents. Rounding DOWN (not to nearest)
  // guarantees the real discount never dips below the 15% floor.
  // Discount band: 15% floor always. Ceiling depends on price tier - 20% for high-cost
  // cards ($100+), 25% for the middle tier, up to 30% for small amounts (<$20).
  const getWishlistPrice = (card: Card) => {
    const price = getPrice(card);
    if (price === null || price <= 0) return null;
    const step = price >= 100 ? 10 : price >= 20 ? 5 : 1;
    const minDiscount = 0.15;
    const maxDiscount = price >= 100 ? 0.20 : price >= 20 ? 0.25 : 0.30;
    const lower = price * (1 - maxDiscount); // steepest discount allowed
    const upper = price * (1 - minDiscount); // shallowest discount allowed
    const candidates: number[] = [];
    for (let value = Math.ceil(lower / step) * step; value <= upper + 1e-9; value += step) {
      if (value > 0) candidates.push(value);
    }
    // The [lower, upper] window can be narrower than one rounding step for cheap cards -
    // when no nice multiple falls inside it, favor staying under the max-discount cap.
    const roundedPrice = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : Math.max(1, Math.ceil(lower));
    const percent = Math.round((1 - roundedPrice / price) * 100);
    return { price: roundedPrice, percent };
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  };

  const getSetSymbol = (card: Card) => {
    return setSymbolById.get(card.setId) || setSymbolByName.get(card.setName) || '';
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const showListTable = viewOptions.displayMode.includes('table');
    const showTrendPoints = viewOptions.displayMode.includes('trend');

    // Computed once so the per-group headings and the card badges always agree on the same numbers.
    const wishlistPriceByCard = new Map<string, { price: number; percent: number }>();
    if (wishlists.viewing && wishlists.wishlist) {
      actualCards.forEach(card => {
        const value = getWishlistPrice(card);
        if (value) wishlistPriceByCard.set(card.id, value);
      });
    }

    const summarizeGroup = (cards: Card[]) => {
      const priced = cards.filter(card => getPrice(card) !== null);
      const realTotal = priced.reduce((sum, card) => sum + (getPrice(card) ?? 0), 0);
      const discounted = cards.filter(card => wishlistPriceByCard.has(card.id));
      const discountedTotal = discounted.reduce((sum, card) => sum + (wishlistPriceByCard.get(card.id)?.price ?? 0), 0);
      return {
        count: cards.length,
        realTotal,
        realAvg: priced.length ? realTotal / priced.length : 0,
        discountedTotal,
        discountedAvg: discounted.length ? discountedTotal / discounted.length : 0,
      };
    };

    // Inline stats in each group's own heading, right where its cards are printed -
    // not a separate summary page disconnected from the cards it describes.
    const groupHeadingText = (group: { label: string; cards: Card[] }) => {
      if (!group.label) return '';
      const stats = summarizeGroup(group.cards);
      return `${escapeHtml(group.label)} <span class="print-group-stats">— ${stats.count} items · Market: ${formatCurrency(stats.realTotal)} total, ${formatCurrency(stats.realAvg)} average · Target: ${formatCurrency(stats.discountedTotal)} total, ${formatCurrency(stats.discountedAvg)} average</span>`;
    };

    if (showTrendPoints) {
      const trendHTML = `<!DOCTYPE html><html><head><title>Print - Trend Points</title><style>
        *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact} body{font-family:Arial,sans-serif;margin:0;padding:12px;color:#172033;background:#fff} h1{font-size:18px;margin:0 0 8px}
        .timing-dot{display:inline-block;width:7px;height:7px;border-radius:50%}.timing-dot--good{background:#43a66c}.timing-dot--fair{background:#d99a22}.timing-dot--bad{background:#d9534f}
        .trend-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.trend-row{display:grid;grid-template-columns:76px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:8px;align-items:stretch;min-width:0;padding:7px;border:1px solid #ccd4df;border-radius:8px;break-inside:avoid;page-break-inside:avoid}.print-left{grid-column:1;grid-row:1;display:grid;grid-template-rows:109px minmax(0,1fr);gap:5px;min-height:0;overflow:hidden}.card-image{width:76px;height:109px;object-fit:contain;border-radius:5px}.print-info{display:flex;align-content:flex-start;align-items:center;flex-wrap:wrap;gap:3px 5px;min-height:0;padding:5px;border:1px solid #d9e0e9;border-radius:5px;color:#657080;font-size:7px;overflow:hidden}.set-row{display:flex;align-items:center;gap:3px;min-width:0;max-width:52px}.set-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.set-symbol{width:10px;height:10px;object-fit:contain}.card-number{margin-left:auto;white-space:nowrap}.info-price{color:#172033;font-size:9px;font-weight:800}.missing{padding:2px 4px;border-radius:999px;background:#d9534f;color:#fff;font-size:6px;font-weight:800;text-transform:uppercase}.owned{flex-basis:100%;font-size:6px}.prices-label{padding:2px 4px;border:1px solid #9aa6b5;border-radius:999px;color:#354154;font-size:6px;font-weight:700}.print-main{grid-column:2;grid-row:1;display:flex;flex-direction:column;min-width:0;min-height:0;padding:5px;border:1px solid #d9e0e9;border-radius:6px;overflow:hidden}.heading{display:flex;justify-content:space-between;gap:8px;min-width:0;font-size:11px;font-weight:700}.heading span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.score{font-size:15px;white-space:nowrap}.label{display:flex;align-items:center;gap:4px;font-size:9px;font-weight:700;margin-top:1px}.label .timing-dot{width:6px;height:6px}.trend-row.timing-good .score,.trend-row.timing-good .label{color:#19875f}.trend-row.timing-fair .score,.trend-row.timing-fair .label{color:#a86f00}.trend-row.timing-bad .score,.trend-row.timing-bad .label{color:#c83f3f}.trend-row.timing-unknown .score,.trend-row.timing-unknown .label{color:#657080}.chart-footer{display:flex;justify-content:space-between;align-items:center;gap:5px;color:#657080;font-size:6px}.mini-legend{display:flex;align-items:center;gap:3px;white-space:nowrap}.mini-legend span{display:inline-flex;align-items:center;gap:1px}.mini-legend .timing-dot{width:4px;height:4px}
        .trend-chart{display:block;width:100%;height:auto;flex:1;min-height:0}.grid{stroke:#dbe2ea;stroke-width:1}.tick{fill:#657080;font-size:10px}.sector-line{stroke:#94a3b8;stroke-width:1;stroke-dasharray:5 4}.sector-label{fill:#657080;font-size:9px}.limit{stroke-width:1.25;stroke-dasharray:5 4}.max{stroke:#d96b36}.min{stroke:#39966c}.limit-label{font-size:13px;font-weight:700}.max-text{fill:#bd5728}.min-text{fill:#25845c}.trend-line{fill:none;stroke:#8b5fc7;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.point{fill:#8b5fc7}.final-point{fill:#fff;stroke:#8b5fc7;stroke-width:2}.final-label{fill:#172033;font-size:13px;font-weight:800;paint-order:stroke;stroke:#fff;stroke-width:4px}.no-trend{padding:35px;color:#777}
        .trend-chart.timing-good .trend-line{stroke:#43a66c}.trend-chart.timing-good .point{fill:#43a66c}.trend-chart.timing-good .final-point{stroke:#43a66c}.trend-chart.timing-fair .trend-line{stroke:#d99a22}.trend-chart.timing-fair .point{fill:#d99a22}.trend-chart.timing-fair .final-point{stroke:#d99a22}.trend-chart.timing-bad .trend-line{stroke:#d9534f}.trend-chart.timing-bad .point{fill:#d9534f}.trend-chart.timing-bad .final-point{stroke:#d9534f}
        .print-group-heading{font-size:13px;margin:14px 0 6px;padding-bottom:3px;border-bottom:1px solid #ccd4df;break-after:avoid;break-inside:avoid}
        .print-group-stats{font-weight:400;font-size:0.72em;color:#657080}
        @media screen and (max-width:850px){.trend-list{grid-template-columns:1fr}}
        @media print{
          @page{size:portrait;margin:6mm}
          body{padding:0}
          h1{display:none}
          .print-group-heading{font-size:11px;margin:6px 0 3px}
          .print-group-stats{font-size:8px}
          .trend-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5mm 2.5mm}
          .trend-row{grid-template-columns:18mm minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:1.5mm;min-height:0;height:45mm;padding:1mm;border-radius:2mm;overflow:hidden}
          .print-left{grid-template-rows:29mm minmax(0,1fr);gap:.8mm}
          .card-image{width:18mm;height:29mm}
          .print-info{gap:.5mm 1mm;padding:.8mm;font-size:5.8px}
          .set-row{max-width:12mm}.set-symbol{width:2.5mm;height:2.5mm}.info-price{font-size:7.5px}.missing,.owned,.prices-label{font-size:5.5px}
          .print-main{padding:1mm}
          .heading{gap:1mm;font-size:8.5px;line-height:1.05}
          .score{font-size:11px}
          .label{font-size:7.5px;line-height:1;margin-top:.5mm}
          .trend-chart{width:100%;height:31mm;max-height:31mm}
          .tick{font-size:8px}
          .sector-label{font-size:7px}
          .limit-label,.final-label{font-size:10px}
          .chart-footer{font-size:5.5px}.mini-legend{gap:.7mm}.mini-legend .timing-dot{width:1mm;height:1mm}
          .no-trend{padding:10mm 0;font-size:8px}
        }
      </style></head><body><h1>Trend points</h1>${printGroups.map(group => `${group.label ? `<h2 class="print-group-heading">${groupHeadingText(group)}</h2>` : ''}<div class="trend-list">${group.cards.map(card => {
        const trend = card.productId ? trendByProductId.get(card.productId) : undefined;
        const timingTone = getTimingTone(trend?.buyTimingScore);
        const timingDot = timingTone === 'unknown' ? '' : `<i class="timing-dot timing-dot--${timingTone}"></i>`;
        const owned = getOwnedQuantity(card); const price = getPrice(card); const symbol = getSetSymbol(card);
        const sortedTrendPoints = trend ? [...trend.points].sort((a, b) => a.date.localeCompare(b.date)) : [];
        const startDate = sortedTrendPoints[0]?.date || '—'; const endDate = trend?.latest?.date || sortedTrendPoints[sortedTrendPoints.length - 1]?.date || '—';
        return `<article class="trend-row timing-${timingTone}"><div class="print-left"><img class="card-image" src="${escapeHtml(card.image || '')}" alt=""><div class="print-info"><span class="set-row">${symbol ? `<img class="set-symbol" src="${escapeHtml(symbol)}" alt="">` : ''}<span>${escapeHtml(card.setName)}</span></span><span class="card-number">#${escapeHtml(card.number)}</span>${price !== null ? `<strong class="info-price">${escapeHtml(formatCurrency(price))}</strong>` : ''}${owned > 0 ? `<span class="owned">Owned ${owned}</span>` : ''}<span class="prices-label">↗ Prices</span></div></div><div class="print-main"><div class="heading"><span>${escapeHtml(card.name)} · ${escapeHtml(card.variant || 'Normal')}</span><span class="score">${trend?.buyTimingScore ?? '—'}/100</span></div><div class="label">${timingDot}${escapeHtml(trend?.buyTimingLabel || 'No trend data')}</div>${trend ? buildPrintableTrendChart(trend, viewOptions.trendXAxisScale) : '<div class="no-trend">No trend data</div>'}<div class="chart-footer"><span>${escapeHtml(startDate)} → ${escapeHtml(endDate)} · latest ${trend?.latest ? escapeHtml(formatCurrency(trend.latest.price)) : '—'}</span><span class="mini-legend"><span><i class="timing-dot timing-dot--good"></i>Good</span><span><i class="timing-dot timing-dot--fair"></i>Fair</span><span><i class="timing-dot timing-dot--bad"></i>Bad</span></span></div></div></article>`;
      }).join('')}</div>`).join('')}</body></html>`;
      printWindow.document.write(trendHTML);
    } else if (showListTable) {
      // Formato tabla

      const tableColumnCount = 6
        + (viewOptions.printTableImages ? 1 : 0)
        + (viewOptions.printTableVariant ? 1 : 0)
        + (viewOptions.printTableType ? 1 : 0)
        + (viewOptions.printTableQuantityMissing ? 2 : 0);
      const printTableFontSize = Math.max(8, 11 - Math.max(0, tableColumnCount - 6) * 0.6);
      const screenTableFontSize = printTableFontSize + 2;

      const tableHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print - Card List</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 4px;
              margin: 0;
            }
            h1 {
              text-align: center;
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: ${screenTableFontSize}px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 0 4px;
              text-align: left;
              line-height: 1.05;
              white-space: nowrap;
            }
            th {
              background-color: #2c3e50;
              color: white;
              padding: 2px 4px;
            }
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            .number-cell {
              text-align: right;
            }
            .icon-cell {
              text-align: center;
              width: 24px;
              min-width: 24px;
              line-height: 0;
            }
            .icon-cell img {
              width: 14px;
              height: 14px;
              max-width: 14px;
              max-height: 14px;
              object-fit: contain;
              display: block;
              margin: 0 auto;
            }
            .card-image-cell {
              width: 56px;
              min-width: 56px;
              padding: 3px;
              text-align: center;
              line-height: 0;
            }
            .card-image-cell img {
              display: block;
              width: 50px;
              max-width: 50px;
              height: auto;
              margin: 0 auto;
              object-fit: contain;
              border-radius: 4px;
            }
            .owned-card {
              background-color: #e8f5e9 !important;
              border-left: 2px solid #4caf50;
            }
            .not-owned-card {
              background-color: #fff3e0 !important;
              border-left: 2px solid #ff9800;
            }
            .print-group-row td {
              background-color: #eef2f7 !important;
              font-weight: 700;
              border-left: none;
            }
            .print-group-stats {
              font-weight: 400;
              opacity: 0.75;
            }
            @media print {
              @page {
                size: auto;
                margin: 6mm;
              }

              body {
                padding: 0;
                margin: 0;
              }
              table {
                font-size: ${printTableFontSize}px;
              }
              th, td {
                padding: 0 3px;
              }
              th {
                padding: 1px 3px;
              }
              .icon-cell img {
                width: 12px;
                height: 12px;
                max-width: 12px;
                max-height: 12px;
              }
              .card-image-cell {
                width: 15mm;
                min-width: 15mm;
                padding: 1mm;
              }
              .card-image-cell img {
                width: 50px;
                max-width: 50px;
              }
            }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                ${viewOptions.printTableImages ? '<th class="card-image-cell">Image</th>' : ''}
                <th>Name</th>
                <th>Set</th>
                <th class="icon-cell">Icon</th>
                <th>Number</th>
                ${viewOptions.printTableVariant ? '<th>Variant</th>' : ''}
                ${viewOptions.printTableType ? '<th>Type</th>' : ''}
                <th>Rarity</th>
                ${viewOptions.printTableQuantityMissing ? '<th class="number-cell">Quantity</th><th class="number-cell">Missing</th>' : ''}
                <th class="number-cell">Price</th>
              </tr>
            </thead>
            <tbody>
              ${printGroups.map(group => `${group.label ? `<tr class="print-group-row"><td colspan="${tableColumnCount}">${groupHeadingText(group)}</td></tr>` : ''}${group.cards.map(card => {
        const owned = getOwnedQuantity(card);
        const missing = getMissingToLimit(card);
        const price = getPrice(card);

        const rowClass = collectionFilter.selectedCollections.length > 0
          ? (owned > 0 ? 'owned-card' : 'not-owned-card')
          : '';

        const setIcon = getSetSymbol(card);
        const iconCell = setIcon
          ? `<td class="icon-cell"><img src="${setIcon}" alt="" /></td>`
          : '<td class="icon-cell">-</td>';

        return `
                  <tr class="${rowClass}">
                    ${viewOptions.printTableImages ? `<td class="card-image-cell">${card.image ? `<img src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}" />` : '-'}</td>` : ''}
                    <td>${card.name}</td>
                    <td>${card.setName}</td>
                    ${iconCell}
                    <td>${card.number}</td>
                    ${viewOptions.printTableVariant ? `<td>${card.variant || '-'}</td>` : ''}
                    ${viewOptions.printTableType ? `<td>${card.types?.join(', ') || '-'}</td>` : ''}
                    <td>${card.rarity || '-'}</td>
                    ${viewOptions.printTableQuantityMissing ? `<td class="number-cell">${owned}</td><td class="number-cell">${missing}</td>` : ''}
                    <td class="number-cell">${formatCurrency(price)}</td>
                  </tr>
                `;
      }).join('')}`).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;
      printWindow.document.write(tableHTML);
    } else {
      // Formato cards (grid con imágenes)
      const cardsHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Print - Cards</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 8px;
              margin: 0;
              background: #333;
            }
            h1 {
              text-align: center;
              margin: 10px 0;
              font-size: 16px;
              color: white;
            }
            .print-group-heading {
              color: white;
              font-size: 13px;
              margin: 10px 4px 6px;
              padding-bottom: 3px;
              border-bottom: 1px solid #666;
              break-after: avoid;
            }
            .print-group-stats {
              font-weight: 400;
              font-size: 0.72em;
              color: #bbb;
            }
            .card-grid {
              display: flex;
              flex-wrap: wrap;
              gap: 14px;
              justify-content: center;
              align-items: flex-start;
            }
            .card {
              position: relative;
              width: 160px;
              height: 230px;
              break-inside: avoid;
            }
            .card img {
              width: 160px;
              height: 230px;
              border-radius: 10px;
              display: block;
            }

            .card.shadowed img {
              filter: brightness(50%);
            }

            .card-tags {
              position: absolute;
              top: 70%;
              left: 2px;
              transform: translateY(-50%);
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              gap: 2px;
              z-index: 2;
              max-width: calc(100% - 8px);
            }

            .card-tag {
              background: rgba(0, 0, 0, 0.7);
              color: white;
              font-size: 10px;
              padding: 1px 4px;
              border-radius: 2px;
              max-width: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              text-align: left;
            }

            .card-name-tag {
              font-weight: 700;
            }

            .icon-tag {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: 1px 4px;
            }

            .set-symbol {
              width: 24px;
              height: 24px;
              min-width: 24px;
              max-width: 24px;
              min-height: 24px;
              max-height: 24px;
              object-fit: contain;
              border-radius: 0;
            }

            .prices {
              position: absolute;
              top: 70%;
              right: 8px;
              font-size: 0.9em;
              z-index: 2;
              color: #1f1f1f;
              font-weight: 700;
            }

            .counters {
              position: absolute;
              top: 6px;
              right: 6px;
              display: flex;
              align-items: center;
              gap: 4px;
              padding: 3px 4px 3px 7px;
              border-radius: 999px;
              background: rgba(13, 20, 36, 0.82);
              z-index: 3;
            }

            .counters__label {
              color: white;
              font-size: 7px;
              font-weight: 800;
              text-transform: uppercase;
            }

            .counter {
              display: flex;
              justify-content: center;
              align-items: center;
              min-width: 20px;
              height: 20px;
              padding: 0 4px;
              border-radius: 50%;
              background-color: #5b68a9;
              color: white;
              font-weight: 700;
              font-size: 11px;
            }

            .counter--high {
              background-color: #19875f;
            }

            .missing-box {
              position: absolute;
              bottom: 8px;
              right: 8px;
              display: inline-flex;
              align-items: center;
              gap: 4px;
              min-height: 26px;
              padding: 3px 5px 3px 7px;
              border-radius: 999px;
              background: #a92d39;
              color: white;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
              z-index: 3;
            }

            .missing-box__label {
              font-size: 8px;
              font-weight: 800;
              text-transform: uppercase;
            }

            .missing-box__value {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              min-width: 18px;
              height: 18px;
              padding: 0 4px;
              border-radius: 999px;
              background: white;
              color: #8f1f2c;
              font-size: 11px;
            }

            .wishlist-price-box {
              position: absolute;
              bottom: 8px;
              right: 8px;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 3px 10px;
              border-radius: 10px;
              background: rgba(0, 0, 0, 0.7);
              color: white;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
              z-index: 3;
            }

            .wishlist-price-box__amount {
              font-size: 22px;
              font-weight: 800;
              line-height: 1.15;
            }

            .wishlist-price-box__percent {
              font-size: 9px;
              font-weight: 700;
              opacity: 0.85;
              line-height: 1;
            }

            @media print {
              @page {
                size: auto;
                margin: 6mm;
              }

              * {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }

              body {
                padding: 0;
                background: white;
              }

              h1 {
                display: none;
              }

              .print-group-heading {
                color: #111;
                font-size: 11px;
                margin: 6px 4px 4px;
                border-bottom-color: #ccc;
              }

              .print-group-stats {
                color: #555;
              }

              .card-grid {
                gap: 10px;
              }

              .card {
                border: 1px solid #cfcfcf;
                border-radius: 10px;
                overflow: hidden;
              }

              .card-tag {
                border: 1px solid rgba(255, 255, 255, 0.85);
              }

              .prices {
                color: #111;
                background: rgba(255, 255, 255, 0.72);
                display: inline-block;
                width: max-content;
                padding: 0 4px;
                border-radius: 2px;
              }

              .counter,
              .missing-box {
                border: 1px solid rgba(255, 255, 255, 0.9);
              }

              .wishlist-price-box__amount {
                font-size: 18px;
              }

              .wishlist-price-box__percent {
                font-size: 7px;
              }
            }
          </style>
        </head>
        <body>
          <h1>Cards</h1>
          ${printGroups.map(group => `${group.label ? `<h2 class="print-group-heading">${groupHeadingText(group)}</h2>` : ''}<div class="card-grid">${group.cards.map(card => {
        const currentVariant = card.variant || 'Normal';
        const topLevelVariant = card.cardVariantTopLevel || currentVariant;
        const imageUrl = card.image || '';
        const missing = getMissingToLimit(card);
        const cardClass = card.shadow ? 'card shadowed' : 'card';
        const nearMintPrice = getPrice(card);
        const wishlistPrice = wishlistPriceByCard.get(card.id) ?? null;
        const setIcon = getSetSymbol(card);
        const countersHtml = collectionFilter.selectedCollections
          .map((collection) => {
            const col = card.collections?.find((c) => c.name === collection);
            const quantity = col ? getCollectionTotalQuantity(col) : 0;
            if (quantity <= 0) return '';
            return `<span class="counter ${quantity >= 3 ? 'counter--high' : ''}">${quantity}</span>`;
          })
          .join('');

        return `
                <div class="${cardClass}">
                  <img src="${imageUrl}" alt="${card.name}">
                  <div class="card-tags">
                    <div class="card-tag card-name-tag">${escapeHtml(card.name)}</div>
                    <div class="card-tag">${topLevelVariant}</div>
                    ${setIcon ? `<div class="card-tag icon-tag"><img src="${setIcon}" alt="" class="set-symbol" /></div>` : ''}
                    <div class="card-tag">${card.number}</div>
                    <div class="card-tag">${card.setName}</div>
                  </div>
                  ${nearMintPrice !== null ? `<div class="prices">${formatCurrency(nearMintPrice)}</div>` : ''}
                  ${countersHtml ? `<div class="counters"><span class="counters__label">Owned</span>${countersHtml}</div>` : ''}
                  ${wishlistPrice !== null
        ? `<div class="wishlist-price-box"><span class="wishlist-price-box__amount">${wishlistPrice.price}</span><span class="wishlist-price-box__percent">-${wishlistPrice.percent}%</span></div>`
        : (missing > 0 && collectionFilter.enabled) ? `<div class="missing-box"><span class="missing-box__label">Missing</span><strong class="missing-box__value">${missing}</strong></div>` : ''}
                </div>
              `;
      }).join('')}</div>`).join('')}
        </body>
        </html>
      `;
      printWindow.document.write(cardsHTML);
    }

    if (wishlists.viewing && wishlists.wishlist) {
      printWindow.document.title = wishlists.wishlist.name + (wishlists.subcollection ? ` / ${wishlists.subcollection.name}` : '');
    }
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <button onClick={handlePrint} className="print-btn sidebar-action-btn" title={trendLoading ? "Wait for trend data to finish loading" : "Print"} disabled={busy || !actualCards.length || (viewOptions.displayMode.includes('trend') && trendLoading)}>
      <span className="sidebar-action-btn__icon" aria-hidden="true"><Printer size={16} /></span>
      <span className="sidebar-action-btn__label">Print</span>
      <span className="sidebar-action-btn__count" aria-label={`${actualCards.length} cards`}>{actualCards.length}</span>
    </button>
  );
};
