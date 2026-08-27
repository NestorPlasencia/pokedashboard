import { useEffect } from 'react';
import { useCardContext } from '../context/CardContext';
import { fetchTrendPoints } from '../services/trendPoints';
import type { Card } from '../types/dashboard';

export function useTrendPoints() {
  const { visibleCards, viewOptions, variantsFilter, conditionsFilter, setRenderCards, trendByProductId, setTrendByProductId, trendLoading, setTrendLoading, trendError, setTrendError } = useCardContext();
  const ids = visibleCards.filter((card): card is Card => !('isPlaceholder' in card) && Number.isInteger(card.productId) && (card.productId ?? 0) > 0).map(card => card.productId as number);
  const idKey = [...new Set(ids)].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!viewOptions.displayMode.includes('trend') || !idKey) {
      setRenderCards(visibleCards);
      setTrendByProductId(new Map());
      return;
    }
    let cancelled = false;
    const uniqueIds = idKey.split(',').map(Number);
    const printing = variantsFilter.length === 1 && !variantsFilter.includes('All') ? variantsFilter[0] : undefined;
    const condition = conditionsFilter.length === 1 && !conditionsFilter.includes('All') ? conditionsFilter[0] : undefined;
    const load = async () => {
      setTrendLoading(true);
      setTrendError(null);
      try {
        const batches = [];
        for (let i = 0; i < uniqueIds.length; i += 500) batches.push(fetchTrendPoints(uniqueIds.slice(i, i + 500), { printing, condition }));
        const results = await Promise.all(batches);
        if (cancelled) return;
        const map = new Map(results.flatMap(result => result.trends).map(trend => [trend.productId, trend]));
        setTrendByProductId(map);
        const ranked = [...visibleCards].sort((a, b) => {
          if ('isPlaceholder' in a || 'isPlaceholder' in b) return 0;
          const scoreA = map.get(a.productId ?? -1)?.buyTimingScore ?? -1;
          const scoreB = map.get(b.productId ?? -1)?.buyTimingScore ?? -1;
          return (scoreA - scoreB) * (viewOptions.trendSortDirection === 'asc' ? 1 : -1);
        });
        // The context map is updated by the parent effect below through a stable state setter.
        setRenderCards(ranked);
      } catch {
        if (!cancelled) { setRenderCards(visibleCards); setTrendError('Unable to load trend data.'); }
      } finally {
        if (!cancelled) setTrendLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [idKey, viewOptions.displayMode, viewOptions.trendSortDirection, variantsFilter, conditionsFilter, visibleCards, setRenderCards, setTrendByProductId, setTrendLoading, setTrendError]);

  return { trendByProductId, trendLoading, trendError };
}
