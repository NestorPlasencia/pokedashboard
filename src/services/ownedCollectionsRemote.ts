import { supabase } from './supabase';
import { parseOwnedCollections, type OwnedCollection } from './ownedCollections';

export const ownedCollectionsTable = 'owned_collections';

/**
 * Raised when the table has not been created yet. The app treats this as "Supabase is not
 * ready for this feature" and keeps the collections in this browser, rather than as an
 * error - the SQL in supabase/owned_collections.sql is run by hand, so a user can be
 * signed in long before the table exists.
 */
export class OwnedCollectionsUnavailableError extends Error {
  /** The Supabase error underneath. Not `Error.cause`, which needs a newer lib than this
   *  project targets. */
  readonly reason?: unknown;

  constructor(reason?: unknown) {
    super('The owned_collections table is not available yet.');
    this.name = 'OwnedCollectionsUnavailableError';
    this.reason = reason;
  }
}

/** PostgREST reports a missing table through its own code; Postgres uses 42P01. */
const isMissingTable = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? '';
  return code === '42P01' || code === 'PGRST205' || /Could not find the table/i.test(message);
};

export async function fetchRemoteOwnedCollections(userId: string): Promise<OwnedCollection[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase
    .from(ownedCollectionsTable)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new OwnedCollectionsUnavailableError(error);
    throw error;
  }
  if (!data) return [];
  return parseOwnedCollections(data.data);
}

export async function saveRemoteOwnedCollections(
  userId: string,
  collections: OwnedCollection[]
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from(ownedCollectionsTable)
    .upsert(
      { user_id: userId, data: collections, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) {
    if (isMissingTable(error)) throw new OwnedCollectionsUnavailableError(error);
    throw error;
  }
}
