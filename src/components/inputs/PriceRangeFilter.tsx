import { useCallback, useEffect, useRef } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";

export const PriceRangeFilter = () => {
  const { filteredCards, priceRange, setPriceRange, conditionsFilter } = useCardContext();
  
  // Track if this is the first render to avoid clearing URL params on initial load
  const isInitialRender = useRef(true);

  // Helper to get the best price for a card based on active conditions
  const getCardVariantPrices = useCallback((card: any): number[] => {
    // Determine which conditions to consider
    const activeConditions = conditionsFilter.includes('All')
      ? ['Near Mint']
      : conditionsFilter.filter(c => c !== 'All');

    const prices: number[] = [];
    
    // Get the best price across active conditions
    let bestPrice: number | null = null;
    
    activeConditions.forEach(condition => {
      const price = card.prices?.[condition];
      if (price !== null && price !== undefined) {
        if (bestPrice === null || price < bestPrice) {
          bestPrice = price;
        }
      }
    });
    
    if (bestPrice !== null) {
      prices.push(bestPrice);
    }
    
    return prices;
  }, [conditionsFilter]);

  // Calculate min and max price treating each variant as independent
  const calculateCardPrices = useCallback(() => {
    let globalMin = Infinity;
    let globalMax = 0;

    filteredCards.forEach(card => {
      const prices = getCardVariantPrices(card);
      prices.forEach(price => {
        globalMin = Math.min(globalMin, price);
        globalMax = Math.max(globalMax, price);
      });
    });

    return { globalMin: globalMin === Infinity ? 0 : Math.floor(globalMin), globalMax: Math.ceil(globalMax) };
  }, [filteredCards, getCardVariantPrices]);

  const { globalMin, globalMax } = calculateCardPrices();

  // Check if we have valid price data
  const hasValidPrices = globalMin !== Infinity && globalMax > 0 && globalMin <= globalMax;

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = Number(e.target.value);
    // Allow setting to globalMin (resetting)
    if (newMin === globalMin) {
      setPriceRange(prev => ({ ...prev, min: null }));
    } else if (newMin <= (priceRange.max !== null ? priceRange.max : globalMax)) {
      setPriceRange(prev => ({ ...prev, min: newMin }));
    }
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = Number(e.target.value);
    // Allow setting to globalMax (resetting)
    if (newMax === globalMax) {
      setPriceRange(prev => ({ ...prev, max: null }));
    } else if (newMax >= (priceRange.min !== null ? priceRange.min : globalMin)) {
      setPriceRange(prev => ({ ...prev, max: newMax }));
    }
  };

  const handleReset = () => {
    setPriceRange({ min: null, max: null });
  };

  // Initialize from URL on mount (moved here to avoid race condition with useUrlFilters)
  useEffect(() => {
    const params = parseUrlParams();
    if (!params.priceMin && !params.priceMax) {
      // Only initialize if not already set by useUrlFilters
      // This is a safety measure, useUrlFilters should handle it
    }
  }, []);

  // Update URL when price range changes
  useEffect(() => {
    // Skip URL update on initial render to preserve URL params
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    
    const params: Record<string, string> = {};
    if (priceRange.min !== null) {
      params.priceMin = String(priceRange.min);
    }
    if (priceRange.max !== null) {
      params.priceMax = String(priceRange.max);
    }
    
    if (Object.keys(params).length > 0) {
      updateUrlParams(params as any);
    } else {
      updateUrlParams({ priceMin: undefined, priceMax: undefined } as any);
    }
  }, [priceRange.min, priceRange.max]);

  const minValue = priceRange.min !== null ? priceRange.min : globalMin;
  const maxValue = priceRange.max !== null ? priceRange.max : globalMax;
  const hasActiveMin = priceRange.min !== null;
  const hasActiveMax = priceRange.max !== null;

  const collapsedSummary = (hasActiveMin || hasActiveMax)
    ? (
      <div className="filter-collapsed-summary">
        <div className="filter-collapsed-group">
          {hasActiveMin && (
            <button
              type="button"
              className="filter-collapsed-chip filter-collapsed-chip-button"
              onClick={() => setPriceRange((prev) => ({ ...prev, min: null }))}
              aria-label="Quitar mínimo"
              title="Quitar mínimo"
            >
              Min ${minValue.toFixed(2)} ×
            </button>
          )}
          {hasActiveMax && (
            <button
              type="button"
              className="filter-collapsed-chip filter-collapsed-chip-button"
              onClick={() => setPriceRange((prev) => ({ ...prev, max: null }))}
              aria-label="Quitar máximo"
              title="Quitar máximo"
            >
              Max ${maxValue.toFixed(2)} ×
            </button>
          )}
        </div>
      </div>
    )
    : undefined;

  return (
    <CollapsibleFieldset
      legend="Rango de precio"
      defaultCollapsed={true}
      collapsedSummary={collapsedSummary}
    >
      {!hasValidPrices ? (
        <div className="price-range-container">
          <p className="price-info">No hay cartas con precios disponibles</p>
        </div>
      ) : (
      <div className="price-range-container">
        <div className="price-range-header">
          <span className="price-value-chip">Min ${minValue.toFixed(2)}</span>
          <span className="price-value-chip">Max ${maxValue.toFixed(2)}</span>
          {(priceRange.min !== null || priceRange.max !== null) && (
            <button
              onClick={handleReset}
              className="btn-reset"
              type="button"
              aria-label="Limpiar rango de precio"
              title="Limpiar rango"
            >
              ↺
            </button>
          )}
        </div>

        <div className="price-range-sliders">
          <input
            type="range"
            min={globalMin}
            max={globalMax}
            step="0.01"
            value={minValue}
            onChange={handleMinChange}
            className="price-range-slider price-range-slider-min"
          />
          <input
            type="range"
            min={globalMin}
            max={globalMax}
            step="0.01"
            value={maxValue}
            onChange={handleMaxChange}
            className="price-range-slider price-range-slider-max"
          />
        </div>
      </div>
      )}
    </CollapsibleFieldset>
  );
};
