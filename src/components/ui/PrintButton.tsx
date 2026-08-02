import React, { useMemo } from "react";
import { useCardContext } from "../../context/CardContext";
import { Card } from "../../types/dashboard";
import { getCollectionTotalQuantity } from "../../utils/utils";

export const PrintButton: React.FC = () => {
  const { visibleCards, collectionFilter, viewOptions, sets } = useCardContext();

  const setSymbolById = useMemo(() => {
    return new Map(sets.map((set) => [set.id, set.images?.symbol || set.symbolImage || ""]));
  }, [sets]);

  const setSymbolByName = useMemo(() => {
    return new Map(sets.map((set) => [set.name, set.images?.symbol || set.symbolImage || ""]));
  }, [sets]);

  // Filter out placeholders - only print actual cards
  const actualCards = useMemo(() => {
    return visibleCards.filter(card => !('isPlaceholder' in card)) as Card[];
  }, [visibleCards]);

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

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  };

  const getSetSymbol = (card: Card) => {
    return setSymbolById.get(card.setId) || setSymbolByName.get(card.setName) || '';
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const showListTable = viewOptions.displayMode.includes('table');

    if (showListTable) {
      // Formato tabla

      const tableHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Impresión - Lista de Cartas</title>
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
              font-size: 10px;
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
            .owned-card {
              background-color: #e8f5e9 !important;
              border-left: 2px solid #4caf50;
            }
            .not-owned-card {
              background-color: #fff3e0 !important;
              border-left: 2px solid #ff9800;
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
                font-size: 8px;
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
            }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Set</th>
                <th class="icon-cell">Icono</th>
                <th>Número</th>
                <th>Variant</th>
                <th>Tipo</th>
                <th>Rareza</th>
                <th class="number-cell">Cantidad</th>
                <th class="number-cell">Faltantes</th>
                <th class="number-cell">Precio</th>
              </tr>
            </thead>
            <tbody>
              ${actualCards.map(card => {
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
                    <td>${card.name}</td>
                    <td>${card.setName}</td>
                    ${iconCell}
                    <td>${card.number}</td>
                    <td>${card.variant || '-'}</td>
                    <td>${card.types?.join(', ') || '-'}</td>
                    <td>${card.rarity || '-'}</td>
                    <td class="number-cell">${owned}</td>
                    <td class="number-cell">${missing}</td>
                    <td class="number-cell">${formatCurrency(price)}</td>
                  </tr>
                `;
      }).join('')}
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
          <title>Impresión - Cartas</title>
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
              top: 8px;
              right: 8px;
              display: flex;
              gap: 4px;
              z-index: 3;
            }

            .counter {
              display: flex;
              justify-content: center;
              align-items: center;
              width: 26px;
              height: 26px;
              border-radius: 50%;
              background-color: #4a5f8f;
              color: white;
              font-weight: 700;
              font-size: 0.9em;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            }

            .counter--high {
              background-color: red;
            }

            .missing-box {
              position: absolute;
              bottom: 10px;
              right: 8px;
              width: 28px;
              height: 28px;
              background-color: #8b3a3a;
              color: white;
              font-weight: bold;
              font-size: 0.9em;
              display: flex;
              justify-content: center;
              align-items: center;
              border-radius: 50%;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
              z-index: 3;
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
            }
          </style>
        </head>
        <body>
          <h1>Cartas</h1>
          <div class="card-grid">
            ${actualCards.map(card => {
        const currentVariant = card.variant || 'Normal';
        const topLevelVariant = card.cardVariantTopLevel || currentVariant;
        const imageUrl = card.image || '';
        const missing = getMissingToLimit(card);
        const cardClass = card.shadow ? 'card shadowed' : 'card';
        const nearMintPrice = getPrice(card);
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
                    <div class="card-tag">${topLevelVariant}</div>
                    ${setIcon ? `<div class="card-tag icon-tag"><img src="${setIcon}" alt="" class="set-symbol" /></div>` : ''}
                    <div class="card-tag">${card.number}</div>
                    <div class="card-tag">${card.setName}</div>
                  </div>
                  ${nearMintPrice !== null ? `<div class="prices">${formatCurrency(nearMintPrice)}</div>` : ''}
                  ${countersHtml ? `<div class="counters">${countersHtml}</div>` : ''}
                  ${(missing > 0 && collectionFilter.enabled) ? `<div class="missing-box">${missing}</div>` : ''}
                </div>
              `;
      }).join('')}
          </div>
        </body>
        </html>
      `;
      printWindow.document.write(cardsHTML);
    }

    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  return (
    <button onClick={handlePrint} className="print-btn" title="Imprimir">
      🖨️ Imprimir
    </button>
  );
};
