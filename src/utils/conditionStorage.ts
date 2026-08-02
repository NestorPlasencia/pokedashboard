import type { Card, ConditionKey } from "../types/dashboard";

export type CardConditions = Partial<Record<ConditionKey, number>>;

/** Map: cardId → collectionName → per-condition quantities */
export type ConditionOverrides = {
  [cardId: string]: {
    [collectionName: string]: CardConditions;
  };
};

export type ExportedConditionEntry = {
  id: string;
  product_id?: number;
  product_name: string;
  collection: string;
  conditions: CardConditions;
};

const STORAGE_KEY = "pokereg_condition_overrides";

export const CONDITION_KEYS: ConditionKey[] = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
];

export const CONDITION_ABBR: Record<ConditionKey, string> = {
  "Near Mint": "NM",
  "Lightly Played": "LP",
  "Moderately Played": "MP",
  "Heavily Played": "HP",
  "Damaged": "D",
};

// ─── CRUD ────────────────────────────────────────────────────────────────────

export const getConditionOverrides = (): ConditionOverrides => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveOverrides = (overrides: ConditionOverrides): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
};

export const setConditionOverride = (
  cardId: string,
  collectionName: string,
  conditions: CardConditions
): void => {
  const overrides = getConditionOverrides();
  if (!overrides[cardId]) overrides[cardId] = {};
  overrides[cardId][collectionName] = conditions;
  saveOverrides(overrides);
};

/** Set the same conditions on every card in the list */
export const setBulkConditionOverride = (
  cardIds: string[],
  collectionName: string,
  conditions: CardConditions
): void => {
  const overrides = getConditionOverrides();
  for (const cardId of cardIds) {
    if (!overrides[cardId]) overrides[cardId] = {};
    overrides[cardId][collectionName] = { ...conditions };
  }
  saveOverrides(overrides);
};

export const removeConditionOverride = (
  cardId: string,
  collectionName: string
): void => {
  const overrides = getConditionOverrides();
  if (overrides[cardId]) {
    delete overrides[cardId][collectionName];
    if (Object.keys(overrides[cardId]).length === 0) delete overrides[cardId];
    saveOverrides(overrides);
  }
};

export const clearAllOverrides = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

// ─── Import / Export ─────────────────────────────────────────────────────────

/** Produce an array of entries ready to use as generate-script input */
export const buildExportEntries = (
  allCards: Card[],
  collectionFilter?: string[]
): ExportedConditionEntry[] => {
  const overrides = getConditionOverrides();
  const entries: ExportedConditionEntry[] = [];

  for (const [cardId, collections] of Object.entries(overrides)) {
    const card = allCards.find((c) => c.id === cardId);
    for (const [collectionName, conditions] of Object.entries(collections)) {
      if (collectionFilter && !collectionFilter.includes(collectionName)) continue;
      if (Object.values(conditions).some((v) => v !== undefined && v > 0)) {
        entries.push({
          id: cardId,
          product_id: card?.productId,
          product_name: card?.name ?? cardId,
          collection: collectionName,
          conditions,
        });
      }
    }
  }

  return entries;
};

export const downloadJSON = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/** Import a previously exported JSON and merge it into localStorage */
export const importConditionOverrides = (json: string): number => {
  const entries: ExportedConditionEntry[] = JSON.parse(json);
  const overrides = getConditionOverrides();
  let count = 0;
  for (const entry of entries) {
    if (!overrides[entry.id]) overrides[entry.id] = {};
    overrides[entry.id][entry.collection] = entry.conditions;
    count++;
  }
  saveOverrides(overrides);
  return count;
};
