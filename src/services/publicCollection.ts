import { supabase } from "./supabase";

/**
 * Reading a collection someone shared, without a session.
 *
 * `get_public_collection` is the one deliberate anonymous hole in the schema's RLS: every
 * table is otherwise closed to `anon`. It returns only shareable data - never purchase
 * prices, notes, copy ids or the owner - so nothing here needs filtering on the way out.
 */

export type PublicCollectionCard = {
  product_id: number;
  name: string;
  set_name: string | null;
  number: string | null;
  rarity: string | null;
  image_url: string | null;
  printing: string | null;
  condition: string | null;
  language: string | null;
  /** Active copies grouped by product, printing, condition and language. */
  quantity: number;
};

export type PublicCollection = {
  id: string;
  name: string;
  updated_at: string;
  tags: string[];
  printings: string[];
  /** Direct children that are themselves public: publishing does not publish them. */
  subcollections: { id: string; name: string }[];
  cards: PublicCollectionCard[];
};

/**
 * A private collection and one that never existed are the same answer on purpose, so a
 * shared id cannot be used to probe for which collections exist.
 */
export class PublicCollectionNotFound extends Error {
  constructor() {
    super("That collection is not available.");
    this.name = "PublicCollectionNotFound";
  }
}

export async function loadPublicCollection(id: string): Promise<PublicCollection> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("get_public_collection", {
    p_collection_id: id,
  });
  if (error) {
    if (/Collection not found/i.test(error.message)) throw new PublicCollectionNotFound();
    throw error;
  }
  if (!data) throw new PublicCollectionNotFound();
  return data as PublicCollection;
}
