export interface CardCollector {
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
}
