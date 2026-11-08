import type { Card, SortConfig } from "../types/dashboard";
import {
  DEFAULT_ENERGY_TYPES_ORDER,
  DEFAULT_RARITIES_ORDER,
  DEFAULT_VARIANTS_ORDER,
} from "../constants/constants.ts";
import { getBestAvailablePrice } from "./collectionValue.ts";
import { compareEvolutionaryPokedexNumbers } from "./pokedexEvolution.ts";

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
  // Promo can be an additional catalog classification. When another rarity exists,
  // use that rarity to position the card among its peers.
  const nonPromo = candidates.filter((candidate) => !/\bpromo\b/i.test(candidate));
  const orderedCandidates = nonPromo.length ? nonPromo : candidates;
  let best = orderedCandidates[0] || "";
  let bestIdx = -1;
  for (const c of orderedCandidates) {
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
  // An unlisted rarity should not jump ahead of Common because indexOf returned -1.
  return (aIndex === -1 ? DEFAULT_RARITIES_ORDER.length : aIndex)
    - (bIndex === -1 ? DEFAULT_RARITIES_ORDER.length : bIndex);
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


/** Which price a card sorts by: Near Mint by default, its copies' own condition in a collection. */
export type SortPrice = (card: Card) => number | null | undefined;

const sortByPrice = (priceOf: SortPrice, direction: 1 | -1) => (a: Card, b: Card) => {
  const ap = priceOf(a);
  const bp = priceOf(b);
  if (ap == null && bp == null) return 0;
  if (ap == null) return 1; // push cards without price to the end
  if (bp == null) return -1;
  return (ap - bp) * direction;
};

/** How many copies a card sorts by: all collections by default, the selected ones when scoped. */
export type SortQuantity = (card: Card) => number;

const totalOwnedQuantity: SortQuantity = (card) =>
  (card.collections || []).reduce(
    (sum, collection) => sum + Object.values(collection.quantity || {}).reduce((s, q) => s + (q || 0), 0),
    0
  );

export const orderByQuantity = (
  cards: Card[],
  direction: 'asc' | 'desc',
  quantityOf: SortQuantity = totalOwnedQuantity
) => {
  const factor = direction === 'asc' ? 1 : -1;
  const quantities = new Map(cards.map((card) => [card, quantityOf(card)]));
  return [...cards].sort((a, b) =>
    (quantities.get(a)! - quantities.get(b)!) * factor || sortBySetAndNumber(a, b)
  );
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

// Release position of each set (series order, then set order within the series), filled
// from the catalog hierarchy once it loads. Until then sets fall back to series order and id.
const setReleaseRanks = new Map<string, number>();

export const registerSetReleaseOrder = (
  series: { order: number; sets: { id: number | string; order: number }[] }[]
) => {
  setReleaseRanks.clear();
  [...series]
    .sort((a, b) => a.order - b.order)
    .flatMap((serie) => [...serie.sets].sort((a, b) => a.order - b.order))
    .forEach((set, index) => setReleaseRanks.set(String(set.id), index));
};

const sortBySetRelease = (a: Card, b: Card) => {
  const aRank = setReleaseRanks.get(String(a.setId));
  const bRank = setReleaseRanks.get(String(b.setId));
  if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
  return (a.setSeriesOrder ?? Infinity) - (b.setSeriesOrder ?? Infinity)
    || (Number(a.setId) || 0) - (Number(b.setId) || 0);
};

// Position of each Pokémon form within its species: the default form first, then the others
// in catalog order (e.g. Arcanine, Hisuian Arcanine, Arcanine Shiny). Filled from the
// pokemon-forms catalog once it loads.
const pokemonFormRanks = new Map<string, number>();

export const registerPokemonFormOrder = (
  forms: { id: number; name: string; isDefault?: boolean }[]
) => {
  pokemonFormRanks.clear();
  forms.forEach((form) => pokemonFormRanks.set(form.name, form.isDefault ? -1 : form.id));
};

// Cards without form data stay in one group rather than splitting by name ("Venusaur V").
const pokemonFormOf = (card: Card) => card.pokemonForms?.[0] || "";

/** Groups a species' cards by Pokémon form (regular, Hisuian, Galarian…), default form first. */
const sortByPokemonForm = (a: Card, b: Card) => {
  const aForm = pokemonFormOf(a);
  const bForm = pokemonFormOf(b);
  if (aForm === bForm) return 0;
  const aRank = pokemonFormRanks.get(aForm);
  const bRank = pokemonFormRanks.get(bForm);
  if (aRank !== undefined && bRank !== undefined && aRank !== bRank) return aRank - bRank;
  return aForm.localeCompare(bForm);
};

const sortByVariant = (a: Card, b: Card) => {
  const rank = (card: Card) => {
    const index = DEFAULT_VARIANTS_ORDER.indexOf(card.variant || "Normal");
    return index === -1 ? DEFAULT_VARIANTS_ORDER.length : index;
  };
  return rank(a) - rank(b) || (a.variant || "").localeCompare(b.variant || "");
};

const sortByPrintedNumber = (a: Card, b: Card) =>
  (a.number || "").localeCompare(b.number || "", undefined, { numeric: true });

/**
 * Where a card falls in the evolutionary Pokédex: Pokémon first, then Trainer Supporters,
 * Items and Pokémon Tools, Stadiums and finally Energy.
 */
const evolutionaryCardGroup = (card: Card) => {
  const supertype = (card.supertype || card.cardType || "").toLowerCase();
  if (card.nationalPokedexNumbers?.length || supertype.startsWith("pok")) return 0;
  if (supertype === "energy") return 4;
  const subtypes = card.subtypes || [];
  if (subtypes.includes("Supporter")) return 1;
  if (subtypes.includes("Stadium")) return 3;
  if (supertype === "trainer") return 2; // Items, Pokémon Tools and older untyped trainers
  return 5;
};

// Card mechanics printed as a name suffix: "Venusaur V", "Charizard VMAX", "Mew ex", "Pikachu-GX".
const SPECIAL_NAME_SUFFIX = /(?:^|[\s-])(V|VMAX|VSTAR|V-UNION|ex|EX|GX|BREAK|LV\.X|LEGEND|☆|◇)$/;
// The same mechanics as a rarity: "Holo Rare V", "Rare Holo VMAX", "Rare Holo ex", "Shiny Rare V".
const SPECIAL_RARITY = /\b(V|VMAX|VSTAR|V-UNION|ex|EX|GX)\b/;

/**
 * Whether a Pokémon card is a special mechanic card (V, VMAX, ex, GX…) rather than a base
 * card. Checks the name and every rarity, so a V promo whose main rarity is just "Promo"
 * (with "Holo Rare V" as a second rarity, or "V" in its name) still counts as a V.
 */
export const isSpecialMechanicCard = (card: Pick<Card, 'name' | 'rarity' | 'rarities'>) =>
  SPECIAL_NAME_SUFFIX.test((card.name || "").trim())
  || [card.rarity, ...(card.rarities || [])].some((rarity) => !!rarity && SPECIAL_RARITY.test(rarity));

/**
 * Evolutionary Pokédex order. Pokémon follow their evolution family; within each species,
 * cards are grouped by Pokémon form (regular, then Hisuian, Galarian…). Within each form,
 * base cards come before special mechanic cards (V, VMAX, VSTAR, ex, GX…), then by rarity,
 * set release and number; the card's printing (Normal, Reverse Holo…) only breaks ties, so
 * both printings of the same card sit together. Trainers and Energy follow, grouped as
 * Supporter, Item/Pokémon Tool, Stadium, Energy, each A–Z.
 */
const sortByPokedexEvolution = (a: Card, b: Card) => {
  const aGroup = evolutionaryCardGroup(a);
  const bGroup = evolutionaryCardGroup(b);
  if (aGroup !== bGroup) return aGroup - bGroup;
  if (aGroup === 0) {
    return compareEvolutionaryPokedexNumbers(a.nationalPokedexNumbers?.[0], b.nationalPokedexNumbers?.[0])
      || sortByPokemonForm(a, b)
      || Number(isSpecialMechanicCard(a)) - Number(isSpecialMechanicCard(b))
      || sortByRariTies(a, b)
      || sortBySetRelease(a, b)
      || sortByPrintedNumber(a, b)
      || sortByVariant(a, b);
  }
  return (a.name || "").localeCompare(b.name || "")
    || sortBySetRelease(a, b)
    || sortByPrintedNumber(a, b)
    || sortByVariant(a, b);
};

export const orderByPokedexEvolution = (cards: Card[]) => {
  return [...cards].sort(sortByPokedexEvolution);
};

export const orderByPokedexAndRarity = (cards: Card[]) => {
  return [...cards].sort((a, b) => sortByPokedex(a, b) || sortByRariTies(a, b));
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

export const orderByPriceAsc = (cards: Card[], priceOf: SortPrice = getBestAvailablePrice) => {
  return [...cards].sort(sortByPrice(priceOf, 1));
};

export const orderByPriceDesc = (cards: Card[], priceOf: SortPrice = getBestAvailablePrice) => {
  return [...cards].sort(sortByPrice(priceOf, -1));
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
  "Pokédex evolutiva",
  "Pokedex and Rarity",
  "Energy",
  "Rarities",
  "Energy and Name",
  "Energy and Pokedex",
  "Price ↑",
  "Price ↓",
  "Quantity ↑",
  "Quantity ↓",
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
    case "Pokédex evolutiva":
    case "Pokédex evolutiva and Rarity": // retired option: old links open the evolutionary order
      return { field: 'pokedexEvolution', direction: 'asc' };
    case "Pokedex and Rarity":
      return { field: 'pokedexAndRarity', direction: 'asc' };
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
    case "Quantity ↑":
      return { field: 'quantity', direction: 'asc' };
    case "Quantity ↓":
      return { field: 'quantity', direction: 'desc' };
    case "Trend score ↑":
      return { field: 'buyTimingScore', direction: 'asc' };
    case "Trend score ↓":
      return { field: 'buyTimingScore', direction: 'desc' };
    default:
      return { field: 'number', direction: 'asc' };
  }
};
