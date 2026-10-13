export const SUGGESTED_PRICE_TIERS = [
  { id: "under5", label: "$0 a menos de $5", minimum: 0, maximum: 5, example: 2.21, legacyId: "low" },
  { id: "under10", label: "$5 a menos de $10", minimum: 5, maximum: 10, example: 8, legacyId: "low" },
  { id: "under20", label: "$10 a menos de $20", minimum: 10, maximum: 20, example: 15, legacyId: "low" },
  { id: "under50", label: "$20 a menos de $50", minimum: 20, maximum: 50, example: 40, legacyId: "middle" },
  { id: "under100", label: "$50 a menos de $100", minimum: 50, maximum: 100, example: 80, legacyId: "middle" },
  { id: "from100", label: "$100 o más", minimum: 100, maximum: null, example: 200, legacyId: "high" },
] as const;

export type SuggestedPriceTier = (typeof SUGGESTED_PRICE_TIERS)[number]["id"];

export interface SuggestedPriceSettings {
  showOnCards: boolean;
  showInWishlistPrint: boolean;
  tiers: Record<SuggestedPriceTier, { minimumDiscountPercent: number; maximumDiscountPercent: number; roundingStep: number }>;
}

export const SUGGESTED_PRICE_STORAGE_KEY = "pokedashboard:suggested-prices:v3";
const PREVIOUS_STORAGE_KEY = "pokedashboard:suggested-prices:v2";
const LEGACY_STORAGE_KEY = "pokedashboard:suggested-prices:v1";
const PREVIOUS_TIERS = {
  under5: { maximumDiscountPercent: 15, roundingStep: 1 },
  under10: { maximumDiscountPercent: 18, roundingStep: 1 },
  under20: { maximumDiscountPercent: 20, roundingStep: 1 },
  under50: { maximumDiscountPercent: 25, roundingStep: 5 },
  under100: { maximumDiscountPercent: 20, roundingStep: 5 },
  from100: { maximumDiscountPercent: 18, roundingStep: 10 },
};

export const DEFAULT_SUGGESTED_PRICE_SETTINGS: SuggestedPriceSettings = {
  showOnCards: false,
  showInWishlistPrint: true,
  tiers: {
    under5: { minimumDiscountPercent: 5, maximumDiscountPercent: 10, roundingStep: 0.5 },
    under10: { minimumDiscountPercent: 10, maximumDiscountPercent: 15, roundingStep: 0.5 },
    under20: { minimumDiscountPercent: 10, maximumDiscountPercent: 20, roundingStep: 1 },
    under50: { minimumDiscountPercent: 10, maximumDiscountPercent: 20, roundingStep: 3 },
    under100: { minimumDiscountPercent: 10, maximumDiscountPercent: 20, roundingStep: 3 },
    from100: { minimumDiscountPercent: 10, maximumDiscountPercent: 18, roundingStep: 10 },
  },
};

const boundedNumber = (value: unknown, fallback: number, minimum: number, maximum: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;

/** Validate saved preferences before using them in either the screen or a printout. */
export function normalizeSuggestedPriceSettings(value: unknown): SuggestedPriceSettings {
  const source = value && typeof value === "object" ? value as Partial<SuggestedPriceSettings> & { minimumDiscountPercent?: unknown } : {};
  const defaults = DEFAULT_SUGGESTED_PRICE_SETTINGS;
  const legacyTiers = source.tiers as unknown as Partial<Record<"low" | "middle" | "high", { roundingStep?: unknown }>> | undefined;
  const isLegacy = !!(legacyTiers && (legacyTiers.low || legacyTiers.middle || legacyTiers.high)) &&
    !SUGGESTED_PRICE_TIERS.some(({ id }) => source.tiers?.[id]);
  const isPrevious = !isLegacy && source.minimumDiscountPercent !== undefined &&
    !SUGGESTED_PRICE_TIERS.some(({ id }) => source.tiers?.[id]?.minimumDiscountPercent !== undefined);
  // Upgrade untouched defaults to the requested ranges while retaining custom
  // percentages, rounding and visibility. New preferences have one minimum per tier.
  const tiers = { ...defaults.tiers };
  for (const { id, legacyId } of SUGGESTED_PRICE_TIERS) {
    const saved = source.tiers?.[id];
    const minimumDiscountPercent = boundedNumber(isPrevious && source.minimumDiscountPercent !== 10 ? source.minimumDiscountPercent : saved?.minimumDiscountPercent, defaults.tiers[id].minimumDiscountPercent, 0, 95);
    const maximumDiscountPercent = isPrevious && saved?.maximumDiscountPercent === PREVIOUS_TIERS[id].maximumDiscountPercent ? defaults.tiers[id].maximumDiscountPercent : saved?.maximumDiscountPercent;
    const oldStep = isLegacy ? legacyTiers?.[legacyId]?.roundingStep : saved?.roundingStep;
    const oldDefaultStep = isLegacy ? (legacyId === "low" ? 1 : legacyId === "middle" ? 5 : 10) : PREVIOUS_TIERS[id].roundingStep;
    const roundingStep = (isPrevious || isLegacy) && oldStep === oldDefaultStep ? defaults.tiers[id].roundingStep : oldStep;
    tiers[id] = {
      minimumDiscountPercent,
      maximumDiscountPercent: Math.max(minimumDiscountPercent, boundedNumber(maximumDiscountPercent, defaults.tiers[id].maximumDiscountPercent, 0, 95)),
      roundingStep: Math.round(boundedNumber(roundingStep, defaults.tiers[id].roundingStep, 0.01, 1000) * 100) / 100,
    };
  }
  return {
    showOnCards: typeof source.showOnCards === "boolean" ? source.showOnCards : defaults.showOnCards,
    showInWishlistPrint: typeof source.showInWishlistPrint === "boolean" ? source.showInWishlistPrint : defaults.showInWishlistPrint,
    tiers,
  };
}

export function readSuggestedPriceSettings(storage: Pick<Storage, "getItem">): SuggestedPriceSettings {
  try {
    const raw = storage.getItem(SUGGESTED_PRICE_STORAGE_KEY) ?? storage.getItem(PREVIOUS_STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    return normalizeSuggestedPriceSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSuggestedPriceSettings(null);
  }
}

/** Choose the round price closest to the middle of the discount band, without randomness. */
export function calculateSuggestedPrice(marketPrice: number | null | undefined, settings: SuggestedPriceSettings) {
  if (marketPrice == null || !Number.isFinite(marketPrice) || marketPrice <= 0 || marketPrice * 100 > Number.MAX_SAFE_INTEGER) return null;
  const range = SUGGESTED_PRICE_TIERS.find(({ minimum, maximum }) => marketPrice >= minimum && (maximum === null || marketPrice < maximum))!;
  const tier = settings.tiers[range.id];
  const lowerCents = Math.ceil(marketPrice * (1 - tier.maximumDiscountPercent / 100) * 100 - 1e-7);
  const upperCents = Math.floor(marketPrice * (1 - tier.minimumDiscountPercent / 100) * 100 + 1e-7);
  const stepCents = Math.round(tier.roundingStep * 100);
  const firstMultiple = Math.max(1, Math.ceil(lowerCents / stepCents));
  const lastMultiple = Math.floor(upperCents / stepCents);
  // Round prices take priority. If the band contains no multiple, use the next one
  // below it, preserving the minimum discount. Never replace the chosen step with cents.
  if (lastMultiple < 1) return null;
  const midpoint = (lowerCents + upperCents) / 2;
  const targetCents = firstMultiple <= lastMultiple
    ? Math.min(lastMultiple, Math.max(firstMultiple, Math.round(midpoint / stepCents))) * stepCents
    : lastMultiple * stepCents;
  const price = targetCents / 100;
  return { price, percent: Math.round((1 - price / marketPrice) * 100) };
}

export const formatSuggestedPrice = (price: number) => price.toLocaleString("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2,
});
