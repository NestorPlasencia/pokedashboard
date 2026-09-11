import type { ConditionKey, QuantityKey } from "../types/dashboard";

const CONDITION_KEYS: ConditionKey[] = ["Near Mint", "Lightly Played", "Moderately Played", "Damaged", "Heavily Played"];

/**
 * Copies held in one collection entry, optionally narrowed to some conditions.
 *
 * Without a condition filter every copy counts, including those of unknown condition;
 * with one, only copies recorded in those conditions do.
 */
export const countCopies = (
  quantity: Partial<Record<QuantityKey, number>> | undefined,
  conditionsFilter: string[] = ["All"]
): number => {
  if (!quantity) return 0;
  if (conditionsFilter.includes("All")) {
    return Object.values(quantity).reduce((sum, value) => sum + (value || 0), 0);
  }
  return CONDITION_KEYS
    .filter((condition) => conditionsFilter.includes(condition))
    .reduce((sum, condition) => sum + (quantity[condition] || 0), 0);
};
