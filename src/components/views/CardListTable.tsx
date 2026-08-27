import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useCardContext } from "../../context/CardContext";
import { Card } from "../../types/dashboard";
import { getCollectionTotalQuantity } from "../../utils/utils";
import { buildPriceExplorerUrl } from "../../utils/priceExplorer";

const formatCurrency = (value: number | undefined | null) => {
  if (value === undefined || value === null) return '-';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
};

const escapeCsvValue = (value: string | number | null | undefined): string => {
  const safeValue = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
};

const CardListTableComponent: React.FC = () => {
  const { renderCards, collectionFilter, sets, seriesSelection } = useCardContext();
  const [itemsToShow, setItemsToShow] = useState<number>(50);

  // Memoize the load more callback
  const handleLoadMore = useCallback(() => {
    setItemsToShow((prev) => prev + 50);
  }, []);

  useEffect(() => {
    // Find the scrollable parent container (.card-view)
    const sentinel = document.querySelector('#table-sentinel');
    const scrollContainer = sentinel?.closest('.card-view');

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      {
        root: scrollContainer as Element,
        threshold: 0.1,
        rootMargin: '200px'
      }
    );

    if (sentinel) {
      observer.observe(sentinel);
    }
    return () => observer.disconnect();
  }, [handleLoadMore]);

  // Filter out placeholders - only show actual cards
  const actualCards = useMemo(() => {
    return renderCards.filter(card => !('isPlaceholder' in card)) as Card[];
  }, [renderCards]);

  // Display data is always actualCards (no pokedex grouping)
  const displayData = actualCards;

  const displayedCards = useMemo(() => {
    return displayData.slice(0, itemsToShow);
  }, [displayData, itemsToShow]);

  const setSymbolById = useMemo(() => {
    return new Map(sets.map((set) => [set.id, set.images?.symbol || set.symbolImage || ""]));
  }, [sets]);

  const setSymbolByName = useMemo(() => {
    return new Map(sets.map((set) => [set.name, set.images?.symbol || set.symbolImage || ""]));
  }, [sets]);

  // Memoize helper functions
  const getOwnedQuantity = useCallback((card: Card) => {
    return (card.collections || [])
      .filter(c => collectionFilter.selectedCollections.includes(c.name))
      .reduce((sum, c) => sum + getCollectionTotalQuantity(c), 0);
  }, [collectionFilter.selectedCollections]);

  const getMissingToLimit = useCallback((card: Card) => {
    const owned = getOwnedQuantity(card);
    return Math.max(0, collectionFilter.limit - owned);
  }, [getOwnedQuantity, collectionFilter.limit]);

  const getPrice = useCallback((card: Card) => {
    return card.prices?.["Near Mint"] ?? null;
  }, []);

  const getSetSymbol = useCallback((card: Card) => {
    return setSymbolById.get(card.setId) || setSymbolByName.get(card.setName) || "";
  }, [setSymbolById, setSymbolByName]);

  const handleExportCsv = useCallback(() => {
    const headers = [
      'id',
      'name',
      'pokedexNumber',
      'setName',
      'setIconUrl',
      'number',
      'variant',
      'types',
      'rarity',
      'ownedQuantity',
      'missingToLimit',
      'nearMintPrice',
      'imageUrl',
      'productId'
    ];

    const rows = displayData.map((card) => {
      const owned = getOwnedQuantity(card);
      const missing = getMissingToLimit(card);
      const price = getPrice(card);
      const pokedexNumber = card.nationalPokedexNumbers?.[0] ?? '';
      const setIconUrl = getSetSymbol(card);

      return [
        card.id,
        card.name,
        pokedexNumber,
        card.setName,
        setIconUrl,
        card.number,
        card.variant || '',
        card.types?.join(', ') || '',
        card.rarity || '',
        owned,
        missing,
        price ?? '',
        card.image || '',
        card.productId ?? ''
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cards-table-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayData, getOwnedQuantity, getMissingToLimit, getPrice, getSetSymbol]);

  if (displayData.length === 0) {
    const isAwaitingSeries = seriesSelection.included.length === 0 && seriesSelection.excluded.length === 0;
    return (
      <div className="card-list-table-empty">
        {isAwaitingSeries ? 'Select a series to start exploring cards.' : 'No cards match your current filters.'}
      </div>
    );
  }

  return (
    <div className="card-list-table-wrapper">
      <div className="card-list-table-actions">
        <button
          type="button"
          className="card-list-table-export-btn"
          onClick={handleExportCsv}
          title="Export visible table rows to CSV"
        >
          Export CSV
        </button>
      </div>
      <table className="card-list-table">
        <thead>
          <tr>
            <th>Image</th>
            <th>Name</th>
            <th>Set</th>
            <th>Icon</th>
            <th>Number</th>
            <th>Variant</th>
            <th>Type</th>
            <th>Rarity</th>
            <th>Quantity</th>
            <th>Missing</th>
            <th>Price</th>
            <th>Explorer</th>
          </tr>
        </thead>
        <tbody>
          {displayedCards.map((card, index) => {
            const imageUrl = card.image || '';
            const owned = getOwnedQuantity(card);
            const missing = getMissingToLimit(card);
            const price = getPrice(card);
            const setSymbol = getSetSymbol(card);
            const priceExplorerUrl = buildPriceExplorerUrl([card.productId]);

            return (
              <tr key={`${card.id}-${index}`} className={card.shadow ? 'shadowed-row' : ''}>
                <td>
                  <img
                    src={imageUrl}
                    alt={card.name}
                    className="card-list-table-image"
                  />
                </td>
                <td>{card.name}</td>
                <td>{card.setName}</td>
                <td>
                  {setSymbol && (
                    <img
                      src={setSymbol}
                      alt=""
                      className="card-list-table-set-symbol"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.classList.add('is-hidden');
                      }}
                    />
                  )}
                </td>
                <td>{card.number}</td>
                <td>{card.variant || '-'}</td>
                <td>{card.types?.join(', ') || '-'}</td>
                <td>{card.rarity || '-'}</td>
                <td className={`card-list-table-owned ${owned > 0 ? 'is-owned' : ''}`}>
                  {owned}
                </td>
                <td className={`card-list-table-missing ${missing > 0 ? 'is-missing' : 'is-complete'}`}>
                  {missing}
                </td>
                <td>{formatCurrency(price)}</td>
                <td>
                  {priceExplorerUrl ? (
                    <a
                      className="card-list-table-explorer-link"
                      href={priceExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Explore price history for ${card.name}`}
                    >
                      Explore
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div id="table-sentinel" className="card-list-table-sentinel" />
    </div>
  );
};

export const CardListTable = React.memo(CardListTableComponent);
