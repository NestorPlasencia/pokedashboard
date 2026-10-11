import type { BuyingOrder } from '../utils/reportAnalysis';
export type BuyingPreferences = { enabled: boolean; scope: 'all' | 'selected'; group: 'missing' | 'total'; days: number; order: BuyingOrder };
const key = (userId: string) => `pokedashboard:buying-analysis:v1:${userId || 'guest'}`;
export const readBuyingPreferences = (userId: string): BuyingPreferences => {
  const defaults: BuyingPreferences = { enabled: true, scope: 'all', group: userId ? 'missing' : 'total', days: 365, order: 'priority' };
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(userId)) ?? 'null') as Partial<BuyingPreferences> | null;
    if (!raw || typeof raw !== 'object') return defaults;
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : defaults.enabled,
      scope: raw.scope === 'selected' ? 'selected' : 'all',
      group: raw.group === 'missing' || raw.group === 'total' ? raw.group : defaults.group,
      days: [90, 180, 365].includes(raw.days ?? 0) ? raw.days! : defaults.days,
      order: ['saved', 'priority', 'signal-asc', 'signal-desc'].includes(raw.order ?? '') ? raw.order! : defaults.order,
    };
  } catch { return defaults; }
};
export const writeBuyingPreferences = (userId: string, preferences: BuyingPreferences) => {
  window.localStorage.setItem(key(userId), JSON.stringify(preferences));
};
