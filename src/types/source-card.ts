/**
 * Types for the cards and hierarchy API responses.
 */

// --- Hierarchy Types ---
export interface HierarchySet {
  id: number;
  name: string;
  order: number;
  symbolImage: string | null;
}

export interface HierarchySerie {
  id: number;
  name: string;
  order: number;
  sets: HierarchySet[];
}

// --- Source Card Types ---
export interface SourceCardSet {
  set: {
    id: number;
    name: string;
    serie: {
      id: number;
      name: string;
      order: number;
    };
  };
}

export interface SourceCard {
  id: number;
  name: string;
  tcgPlayerProductId: number;
  tcgCollectorId: number;
  tcgPlayerSetSlug: string;
  tcgPlayerLink: string;
  number: string;
  image: string;
  illustrator: { id: number; name: string } | null;
  supertype: { id: number; name: string } | null;
  printing: { id: number; name: string } | null;
  cardVariant: { id: number; name: string } | null;
  cardVariantTopLevel: { id: number; name: string } | null;
  rarities: Array<{ rarity: { id: number; name: string } }> | null;
  energyTypes: Array<{ energyType: { id: number; name: string } }> | null;
  subtypes: Array<{ subtype: { id: number; name: string } }> | null;
  sets: SourceCardSet[] | null;
  pokemonForms: Array<{
    pokemonForm: { id: number; name: string; number: number };
  }> | null;
}

export interface SourceCardsFile {
  items: SourceCard[];
}

// --- Price Entry (from tcgPlayerPrices/*.json) ---
export interface PriceEntry {
  productID: number;
  productConditionID: number;
  condition: string;
  game: string;
  isSupplemental: boolean;
  lowPrice: number;
  marketPrice: number;
  number: string;
  printing: string;
  productName: string;
  rarity: string;
  sales: number;
  set: string;
  setAbbrv: string;
  type: string;
}

// --- Collector Card (from collector/<date>/<collection>.json) ---
export interface CollectorCard {
  product_id: number;
  catalog_category: number;
  catalog_category_name: string;
  catalog_group: string;
  catalog_group_id: number;
  product_name: string;
  image_url: string;
  card_number: string;
  rarity: string;
  quantity: number;
  market_price: number;
  market_price_diff: number;
  market_price_percentage_diff: number;
  total_products_owned_count: number;
  watchlist: number;
  is_owned: number;
  is_card: number;
  web_slug_group: string;
  web_slug_category: number;
}
