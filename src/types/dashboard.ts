import { SetTcgData, CardTcgData } from "./tcg-data";
import type { CollectionOption } from "../services/inventory";
import { CardCollector } from "./collector";

export interface Set extends SetTcgData {
  catalogGroupId?: number;
  series: string;
  pokedataImagePath?: string;
  symbolImage?: string | null;
}

export type PickCardPropertiesFromTcgData = Pick<CardTcgData, 'id' | 'name' | 'types' | 'number' | 'artist' | 'rarity' | 'nationalPokedexNumbers' | 'supertype' | 'subtypes'>;

export type AddAndCardUpdatePropertiesCard = {
  productId?: number;
  /** Exact TCGPlayer metadata used by Mass Entry. */
  tcgPlayerName?: string;
  tcgPlayerNumber?: string;
  tcgPlayerSetAbbreviation?: string;
  catalogGroupId?: number;
  rarities?: string[];
  setNames?: string[];
  setSeriesNames?: string[];
  tags?: string[];

}

export type FixCardPatch = CardTcgData &  AddAndCardUpdatePropertiesCard;

export type PickAndCardUpdatePropertiesCard = PickCardPropertiesFromTcgData & AddAndCardUpdatePropertiesCard;

export interface Card extends PickAndCardUpdatePropertiesCard {
  
  setSeries: string;
  setSeriesOrder?: number;
  setSeriesNames?: string[];

  setId: string;
  setName: string;
  setNames: string[];

  productId?: number;

  cardType: string;
  /** Single image URL for this card */
  image: string;
  collections?: Collection[];
  /** Flat price conditions for this card (each card = one variant) */
  prices: Condition;

  /** Card variant name (e.g. "Normal", "Reverse Holo", "Normal Holo", etc.) */
  variant: string;

  /** Physical printing label (e.g. "Normal", "Holofoil", "Reverse Holofoil"). */
  printing?: string;

  /** Top-level card variant name (e.g. "Standard", "Reverse", etc.) */
  cardVariantTopLevel?: string;

  shadow: boolean;

  // Pokédex region based on nationalPokedexNumbers
  pokedexRegion?: string;

  // Pokemon form names from source data (e.g. ["Primeape"])
  pokemonForms?: string[];

}

export type ConditionKey = "Near Mint" | "Lightly Played" | "Moderately Played" | "Damaged" | "Heavily Played";

export type Condition = {
  [K in ConditionKey]?: number | null;
}


/**
 * How copies are counted per collection. `Unknown` holds copies whose condition was never
 * recorded (null in the shared schema, e.g. every copy Collectr syncs): they count as held,
 * but never match a filter for a specific condition.
 */
export type QuantityKey = ConditionKey | "Unknown";

export interface Collection {
  name: string;
  collectorName: string;
  quantity: Partial<Record<QuantityKey, number>>;
}

/**
 * A collection as the sidebar offers it. Defined by the service that loads it, because
 * collections of every origin - Collectr's mirror and the app's own - are one row shape.
 */
export type OptionsCollection = CollectionOption;

export interface SetEquivalent {
  series: string;
  "tcg-player-name": string;
  "collectr-set-name": string;
  "booster-set-name": string;
  "tcg-player-code": string;
  "tcg-data-id": string;
  "pokedata-set-path": string;
}

export interface CardCollection extends CardCollector {
  id: string;
}

export interface FilterOption {
  order: number;
  label: string;
  property: keyof Card | 'pokedexCompletion' | 'conditions';
  options: string[];
  includedValues: string[];
  excludedValues: string[];
  includeMode: 'ANY' | 'ALL' | 'EXACT_SET';
  excludeMode: 'NOT_ANY' | 'NOT_ALL' | 'NOT_EXACT_SET';
  singleIncludeMatch: 'CONTAINS' | 'EXACT_SINGLE';
  isMultiValue: boolean;
  hideZeroCount?: boolean;
  defaultOrder?: string[];
}

export interface CountTable {
  [row: string]: {
    [column: string]: number;
  };
}

// Pokémon sin cartas (para incluir en vistas de Pokédex)
export interface PokemonWithoutCard {
  id: string;
  name: string;
  pokedexNumber: number;
  pokedexRegion: string;
  isPlaceholder: true; // Para distinguir de Card
  ownedInCollection: boolean;
}

// Pokemon Form returned by the pokemon-forms API
export interface PokemonFormData {
  id: number;
  name: string;
  image: string;
  number: number;
  isDefault: boolean;
  pokemonId: number;
  pokemon: {
    id: number;
    name: string;
    number: number;
    image: string;
    regionId: number;
  };
  regions: {
    id: number;
    pokemonFormId: number;
    regionId: number;
    region: { id: number; name: string; order: number };
  }[];
  variants: {
    id: number;
    pokemonFormId: number;
    pokemonVariantId: number;
    pokemonVariant: { id: number; name: string };
  }[];
  _count: { cards: number };
}

// Placeholder for Pokemon forms without cards
export interface PokemonFormWithoutCard {
  id: string;
  name: string;
  formName: string;
  image: string;
  pokemonNumber: number;
  regionName: string;
  isPlaceholder: true;
  isDefault: boolean;
  variantNames: string[];
  ownedInCollection: boolean;
}

// Modo de agrupación por Pokémon (basado en Pokemon Forms)
export interface PokemonGroupingOptions {
  enabled: boolean; // Activar agrupación por Pokémon
  filterByCollection: 'all' | 'owned' | 'notOwned' | 'ownedNone'; // Filtrar Pokémon por colecciones
  groupingRegions: string[]; // Regiones que aparecerán en la agrupación
  allowVariants: string[]; // allowlist de variantes; empty = "all"
  hideVariants: string[]; // variantes que ocultan forms/cards
  groupSortBy: 'default' | 'cardCount' | 'cardCountDesc' | 'ownedCount' | 'ownedCountDesc'; // ordenar grupos
  fallbackToDefault: boolean; // Agrupar cartas con formas no listadas bajo la forma default
}

// Opciones de filtro de colecciones
export interface CollectionFilterOptions {
  enabled: boolean; // Si el filtro de colecciones está activo
  mode: 'none' | 'hideOwned' | 'hideNotOwned' | 'shadowOwned' | 'shadowNotOwned';
  selectedCollections: string[]; // Colecciones seleccionadas para filtrar
  limit: number; // Límite para considerar "poseída"
  conditionsFilter: string[]; // Condiciones de las cartas en las colecciones (Near Mint, etc.)
}

// Opciones de visualización
export interface ViewOptions {
  displayMode: 'tableGrouped' | 'tableUngrouped' | 'cardsGrouped' | 'cardsUngrouped' | 'trendGrouped' | 'trendUngrouped';
  trendSortDirection: 'asc' | 'desc';
  trendXAxisScale: 'normal' | 'sectors';
  printTableImages: boolean;
  printTableQuantityMissing: boolean;
  printTableType: boolean;
  printTableVariant: boolean;
}

export type TrendRole = 'start' | 'end' | 'minimum' | 'maximum';
export interface TrendPoint { date: string; price: number; segment: string; roles: TrendRole[]; }
export interface TrendSeries {
  productId: number;
  printing: string;
  condition: string;
  latest: { date: string; price: number } | null;
  points: TrendPoint[];
  buyTimingScore: number | null;
  buyTimingLabel: string;
}

// Configuración de ordenamiento
export interface SortConfig {
  field: 'number' | 'pokedex' | 'energy' | 'rarity' | 'energyAndName' | 'energyAndPokedex' | 'price' | 'name' | 'setAndNumber' | 'buyTimingScore';
  direction: 'asc' | 'desc';
}
