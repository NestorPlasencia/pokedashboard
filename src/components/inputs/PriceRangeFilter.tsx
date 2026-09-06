import { useCallback, useEffect } from "react";
import { useCardContext } from "../../context/CardContext";
import { CollapsibleSection } from "../ui/CollapsibleSection";
import { updateUrlParams } from "../../utils/urlParams";
import type { Card } from "../../types/dashboard";

// The inputs use a normalized logarithmic scale. Prices stored in context and
// in the URL remain regular dollar amounts.
const PRICE_SLIDER_STEPS = 1000;

export const PriceRangeFilter = () => {
  // The range itself is restored from the URL in CardContext.
  const { filteredCards, priceRange, setPriceRange, conditionsFilter } = useCardContext();

  // Helper to get the best price for a card based on active conditions
  const getCardVariantPrices = useCallback((card: Card): number[] => {
    // Determine which conditions to consider
    const activeConditions = conditionsFilter.includes('All')
      ? ['Near Mint']
      : conditionsFilter.filter(c => c !== 'All');

    const prices: number[] = [];
    
    // Get the best price across active conditions
    let bestPrice: number | null = null;
    
    activeConditions.forEach(condition => {
      const price = card.prices?.[condition as keyof typeof card.prices];
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

  const priceToSliderValue = useCallback((price: number) => {
    const priceSpan = globalMax - globalMin;
    if (priceSpan <= 0) return 0;

    const clampedPrice = Math.min(globalMax, Math.max(globalMin, price));
    const ratio = Math.log1p(clampedPrice - globalMin) / Math.log1p(priceSpan);
    return Math.round(ratio * PRICE_SLIDER_STEPS);
  }, [globalMin, globalMax]);

  const sliderValueToPrice = useCallback((sliderValue: number) => {
    const priceSpan = globalMax - globalMin;
    if (priceSpan <= 0) return globalMin;

    const ratio = sliderValue / PRICE_SLIDER_STEPS;
    const price = globalMin + Math.expm1(ratio * Math.log1p(priceSpan));
    return Math.round(price * 100) / 100;
  }, [globalMin, globalMax]);

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderValue = Number(e.target.value);
    const newMin = sliderValueToPrice(sliderValue);
    // Allow setting to globalMin (resetting)
    if (sliderValue === 0) {
      setPriceRange(prev => ({ ...prev, min: null }));
    } else if (newMin <= (priceRange.max !== null ? priceRange.max : globalMax)) {
      setPriceRange(prev => ({ ...prev, min: newMin }));
    }
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderValue = Number(e.target.value);
    const newMax = sliderValueToPrice(sliderValue);
    // Allow setting to globalMax (resetting)
    if (sliderValue === PRICE_SLIDER_STEPS) {
      setPriceRange(prev => ({ ...prev, max: null }));
    } else if (newMax >= (priceRange.min !== null ? priceRange.min : globalMin)) {
      setPriceRange(prev => ({ ...prev, max: newMax }));
    }
  };

  const handleReset = () => {
    setPriceRange({ min: null, max: null });
  };

  // Update URL when price range changes. An unset bound is `undefined`, which removes
  // the parameter and keeps a clean URL clean.
  useEffect(() => {
    updateUrlParams({
      priceMin: priceRange.min !== null ? String(priceRange.min) : undefined,
      priceMax: priceRange.max !== null ? String(priceRange.max) : undefined,
    });
  }, [priceRange.min, priceRange.max]);

  const minValue = priceRange.min !== null ? priceRange.min : globalMin;
  const maxValue = priceRange.max !== null ? priceRange.max : globalMax;
  const hasActiveMin = priceRange.min !== null;
  const hasActiveMax = priceRange.max !== null;
  const minSliderValue = priceToSliderValue(minValue);
  const maxSliderValue = priceToSliderValue(maxValue);

  const collapsedSummary = (hasActiveMin || hasActiveMax)
    ? (
      <div className="filter-collapsed-summary">
        <div className="filter-collapsed-group">
          {hasActiveMin && (
            <button
              type="button"
              className="filter-collapsed-chip filter-collapsed-chip-button"
              onClick={() => setPriceRange((prev) => ({ ...prev, min: null }))}
              aria-label="Clear minimum"
              title="Clear minimum"
            >
              Min ${minValue.toFixed(2)} ×
            </button>
          )}
          {hasActiveMax && (
            <button
              type="button"
              className="filter-collapsed-chip filter-collapsed-chip-button"
              onClick={() => setPriceRange((prev) => ({ ...prev, max: null }))}
              aria-label="Clear maximum"
              title="Clear maximum"
            >
              Max ${maxValue.toFixed(2)} ×
            </button>
          )}
        </div>
      </div>
    )
    : undefined;

  return (
    <CollapsibleSection
      title="Price range"
      defaultCollapsed={true}
      collapsedSummary={collapsedSummary}
    >
      {!hasValidPrices ? (
        <div className="price-range-container">
          <p className="price-info">No cards with pricing available</p>
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
              aria-label="Clear price range"
              title="Clear range"
            >
              ↺
            </button>
          )}
        </div>

        <div className="price-range-sliders">
          <span
            className="price-range-selection"
            style={{
              left: `${(minSliderValue / PRICE_SLIDER_STEPS) * 100}%`,
              right: `${100 - (maxSliderValue / PRICE_SLIDER_STEPS) * 100}%`,
            }}
          />
          <input
            type="range"
            min={0}
            max={PRICE_SLIDER_STEPS}
            step={1}
            value={minSliderValue}
            onChange={handleMinChange}
            className="price-range-slider price-range-slider-min"
            aria-label="Minimum price"
            aria-valuetext={`$${minValue.toFixed(2)}`}
          />
          <input
            type="range"
            min={0}
            max={PRICE_SLIDER_STEPS}
            step={1}
            value={maxSliderValue}
            onChange={handleMaxChange}
            className="price-range-slider price-range-slider-max"
            aria-label="Maximum price"
            aria-valuetext={`$${maxValue.toFixed(2)}`}
          />
        </div>
        <span className="price-range-scale-label">Logarithmic scale</span>
      </div>
      )}
    </CollapsibleSection>
  );
};
