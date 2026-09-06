import { supabase } from './supabase';
import { parseWishlists, storageKey, type Wishlist } from './wishlists';

export const wishlistTable = 'wishlist_collections';

export async function fetchRemoteWishlists(userId: string): Promise<Wishlist[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from(wishlistTable)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];
  return parseWishlists(data.data);
}

export async function saveRemoteWishlists(userId: string, collections: Wishlist[]): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from(wishlistTable)
    .upsert(
      { user_id: userId, data: collections, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
}

/** Collections still sitting in this browser, or null when there is nothing usable to migrate. */
export function readLocalBackup(): Wishlist[] | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const collections = parseWishlists(JSON.parse(raw));
    return collections.length ? collections : null;
  } catch {
    return null;
  }
}

export function clearLocalBackup() {
  try { localStorage.removeItem(storageKey); } catch { /* nothing to clean up */ }
}
