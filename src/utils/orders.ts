import type { Card, SortConfig } from "../types/dashboard";
import {
  DEFAULT_ENERGY_TYPES_ORDER,
  DEFAULT_RARITIES_ORDER,
} from "../constants/constants.ts";

const sortByEnergy = (a: Card, b: Card) => {
  // Get the first type from the types array, or empty string if no types
  const aValue = (a["types"] && a["types"].length > 0) ? a["types"][0] : "";
  const bValue = (b["types"] && b["types"].length > 0) ? b["types"][0] : "";
  const aIndex = DEFAULT_ENERGY_TYPES_ORDER.indexOf(aValue);
  const bIndex = DEFAULT_ENERGY_TYPES_ORDER.indexOf(bValue);
  
  // If both not found in order, sort alphabetically
  if (aIndex === -1 && bIndex === -1) {
    return aValue.localeCompare(bValue);
  }
  // If one not found, put it at the end
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  
  return aIndex - bIndex;
};

const sortByName = (a: Card, b: Card) => {
  const aName = a["name"] || "";
  const bName = b["name"] || "";
  return aName.localeCompare(bName);
};

const getBestRarityForOrder = (card: Card) => {
  const candidates = [...(card.rarities || []), card.rarity].filter(
    Boolean
  ) as string[];
  // Choose the candidate with the highest index (best match) in default order
  let best = candidates[0] || "";
  let bestIdx = -1;
  for (const c of candidates) {
    const idx = DEFAULT_RARITIES_ORDER.indexOf(c);
    if (idx !== -1 && idx > bestIdx) {
      best = c;
      bestIdx = idx;
    }
  }
  return best;
};

const sortByRariTies = (a: Card, b: Card) => {
  const aValue = getBestRarityForOrder(a);
  const bValue = getBestRarityForOrder(b);
  const aIndex = DEFAULT_RARITIES_ORDER.indexOf(aValue);
  const bIndex = DEFAULT_RARITIES_ORDER.indexOf(bValue);
  return aIndex - bIndex;
};

const sortByNumber = (a: Card, b: Card) => {
  return parseInt(a["number"]) - parseInt(b["number"]);
};

export const getNationalPokedexNumber = (nationalPokedexNumbers: number[]) => {
  if (nationalPokedexNumbers && nationalPokedexNumbers.length > 0)
    return nationalPokedexNumbers[0];
  return 99999;
};

const sortByPokedex = (a: Card, b: Card) => {
  const aValue = getNationalPokedexNumber(a["nationalPokedexNumbers"]);
  const bValue = getNationalPokedexNumber(b["nationalPokedexNumbers"]);
  return aValue - bValue;
};

// Price helpers
const getCardPrice = (card: Card, _variantsFilter: string[] = ["All"]): number | undefined => {
  if (!card.prices) return undefined;
  
  const prices = card.prices;
  
  // Use best available price with fallback
  if (prices["Near Mint"] !== null && prices["Near Mint"] !== undefined) {
    return prices["Near Mint"];
  } else if (prices["Lightly Played"] !== null && prices["Lightly Played"] !== undefined) {
    return prices["Lightly Played"];
  } else if (prices["Moderately Played"] !== null && prices["Moderately Played"] !== undefined) {
    return prices["Moderately Played"];
  } else if (prices["Damaged"] !== null && prices["Damaged"] !== undefined) {
    return prices["Damaged"];
  } else if (prices["Heavily Played"] !== null && prices["Heavily Played"] !== undefined) {
    return prices["Heavily Played"];
  }
  
  return undefined;
};

const sortByPriceAsc = (variantsFilter: string[]) => (a: Card, b: Card) => {
  const ap = getCardPrice(a, variantsFilter);
  const bp = getCardPrice(b, variantsFilter);
  if (ap == null && bp == null) return 0;
  if (ap == null) return 1; // push cards without price to the end
  if (bp == null) return -1;
  return ap - bp;
};

const sortByPriceDesc = (variantsFilter: string[]) => (a: Card, b: Card) => {
  const ap = getCardPrice(a, variantsFilter);
  const bp = getCardPrice(b, variantsFilter);
  if (ap == null && bp == null) return 0;
  if (ap == null) return 1; // push cards without price to the end
  if (bp == null) return -1;
  return bp - ap;
};

export const orderByEnergy = (cards: Card[]) => {
  return [...cards].sort(sortByEnergy);
};

export const orderByRariTies = (cards: Card[]) => {
  return [...cards].sort(sortByRariTies);
};

export const orderByNumber = (cards: Card[]) => {
  return [...cards].sort(sortByNumber);
};

export const orderByPokedex = (cards: Card[]) => {
  return [...cards].sort(sortByPokedex);
};

export const orderByEnergyAndName = (cards: Card[]) => {
  return [...cards].sort((a, b) => {
    const energyComparison = sortByEnergy(a, b);
    if (energyComparison !== 0) {
      return energyComparison;
    }
    return sortByName(a, b);
  });
};

export const orderByEnergyAndPokedex = (cards: Card[]) => {
  return [...cards].sort((a, b) => {
    const energyComparison = sortByEnergy(a, b);
    if (energyComparison !== 0) {
      return energyComparison;
    }
    return sortByPokedex(a, b);
  });
};

export const orderByPriceAsc = (cards: Card[], variantsFilter: string[] = ["All"]) => {
  return [...cards].sort(sortByPriceAsc(variantsFilter));
};

export const orderByPriceDesc = (cards: Card[], variantsFilter: string[] = ["All"]) => {
  return [...cards].sort(sortByPriceDesc(variantsFilter));
};

const sortBySetAndNumber = (a: Card, b: Card) => {
  // Primero ordenar por setId
  const aSetId = a.setId || "";
  const bSetId = b.setId || "";
  const setIdComparison = aSetId.localeCompare(bSetId);
  
  // Si los setId son diferentes, retornar la comparación
  if (setIdComparison !== 0) {
    return setIdComparison;
  }
  
  // Si los setId son iguales, ordenar por número
  return sortByNumber(a, b);
};

export const orderBySetAndNumber = (cards: Card[]) => {
  return [...cards].sort(sortBySetAndNumber);
};
/** Sort options offered in the sidebar, in the order they are listed. */
export const ORDER_OPTIONS = [
  "None",
  "Number",
  "Set and Number",
  "Pokedex",
  "Energy",
  "Rarities",
  "Energy and Name",
  "Energy and Pokedex",
  "Price ↑",
  "Price ↓",
] as const;

/** Sort options that only make sense in the trend view. */
export const TREND_ORDER_OPTIONS = ["Trend score ↑", "Trend score ↓"] as const;

/**
 * Maps a sort option name to a SortConfig. Shared by the sidebar and by the URL restore
 * so both always agree; an unknown name falls back to the default sort.
 */
export const orderToSortConfig = (order: string): SortConfig => {
  switch (order) {
    case "Number":
      return { field: 'number', direction: 'asc' };
    case "Set and Number":
      return { field: 'setAndNumber', direction: 'asc' };
    case "Pokedex":
      return { field: 'pokedex', direction: 'asc' };
    case "Energy":
      return { field: 'energy', direction: 'asc' };
    case "Rarities":
      return { field: 'rarity', direction: 'asc' };
    case "Energy and Name":
      return { field: 'energyAndName', direction: 'asc' };
    case "Energy and Pokedex":
      return { field: 'energyAndPokedex', direction: 'asc' };
    case "Price ↑":
      return { field: 'price', direction: 'asc' };
    case "Price ↓":
      return { field: 'price', direction: 'desc' };
    case "Trend score ↑":
      return { field: 'buyTimingScore', direction: 'asc' };
    case "Trend score ↓":
      return { field: 'buyTimingScore', direction: 'desc' };
    default:
      return { field: 'number', direction: 'asc' };
  }
};
