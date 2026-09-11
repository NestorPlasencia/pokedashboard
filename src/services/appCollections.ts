import type { Card } from "../types/dashboard";
import type { CollectionKind } from "./inventory";
import { supabase } from "./supabase";

/**
 * Writes for application-owned collections in the shared core schema.
 *
 * Collectr-managed rows are intentionally never written by this module. The database
 * uses `managed_by` and RLS as the final boundary; the UI also hides those actions.
 */

export class AppCollectionsUnavailableError extends Error {
  readonly reason?: unknown;

  constructor(reason?: unknown) {
    super("The shared collection schema is not available yet.");
    this.name = "AppCollectionsUnavailableError";
    this.reason = reason;
  }
}

const isUnavailable = (error: unknown): boolean => {
  const value = error as { code?: string; message?: string };
  const message = value?.message ?? "";
  return (
    value?.code === "42P01" ||
    value?.code === "42703" ||
    value?.code === "PGRST204" ||
    value?.code === "PGRST205" ||
    /does not exist|Could not find the (table|'.*' column)/i.test(message)
  );
};

const fail = (error: unknown): never => {
  if (isUnavailable(error)) throw new AppCollectionsUnavailableError(error);
  throw error;
};

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

type AppCardRef = {
  productId: number;
  /** Physical-copy printing. This is distinct from collection_printings. */
  printing: string | null;
  name: string;
  setName: string;
};

const isProductId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** The shared schema requires every physical copy to reference a catalog product. */
const cardReference = (card: Card): AppCardRef | null => {
  if (!isProductId(card.productId)) return null;
  return {
    productId: card.productId,
    // `printing` is the collection/copy printing. Older generated cards only exposed
    // `variant`, so that remains a safe fallback for existing catalog data.
    printing: card.printing || card.variant || null,
    name: card.name,
    setName: card.setName,
  };
};

export type NewCollection = {
  name: string;
  kind: CollectionKind;
  parentId?: string | null;
};

const tagForKind = (kind: CollectionKind) => (kind === "wishlist" ? "wish" : "own");

export async function createCollection(
  ownerId: string,
  collection: NewCollection
): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await client()
    .from("collections")
    .insert(
      {
        owner_id: ownerId,
        id,
        name: collection.name,
        parent_id: collection.parentId ?? null,
        is_public: false,
        managed_by: null,
      }
    );
  if (error) fail(error);

  const { error: tagError } = await client()
    .from("collection_tags")
    .upsert(
      { owner_id: ownerId, collection_id: id, tag: tagForKind(collection.kind) },
      { onConflict: "owner_id,collection_id,tag", ignoreDuplicates: true }
    );
  if (tagError) {
    // Lists are built from tags, so an untagged collection would be invisible. A fresh
    // collection is removed again if tagging fails.
    await client().from("collections").delete().eq("owner_id", ownerId).eq("id", id);
    fail(tagError);
  }
  return id;
}

export async function renameCollection(
  ownerId: string,
  collectionId: string,
  name: string
): Promise<void> {
  const { data, error } = await client()
    .from("collections")
    .update({ name })
    .eq("owner_id", ownerId)
    .eq("id", collectionId)
    .is("managed_by", null)
    .select("id");
  if (error) fail(error);
  if (!data?.length) throw new Error("Not allowed or collection not found");
}

const descendantsOf = async (ownerId: string, collectionId: string): Promise<string[]> => {
  const { data, error } = await client()
    .from("collections")
    .select("id, parent_id, managed_by")
    .eq("owner_id", ownerId);
  if (error) fail(error);

  const rows = (data ?? []) as Array<{
    id: string;
    parent_id: string | null;
    managed_by: string | null;
  }>;
  const children = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const list = children.get(row.parent_id) ?? [];
    list.push(row);
    children.set(row.parent_id, list);
  }
  const ids: string[] = [];
  const queue = [collectionId];
  while (queue.length) {
    const id = queue.shift();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    queue.push(...(children.get(id) ?? []).map((child) => child.id));
  }
  const managed = rows.find((row) => ids.includes(row.id) && row.managed_by !== null);
  if (managed) {
    throw new Error("This collection contains a Collectr-managed collection.");
  }
  return ids;
};

/** Deletes application-owned copies first, then the collection subtree. */
export async function deleteCollection(ownerId: string, collectionId: string): Promise<void> {
  const ids = await descendantsOf(ownerId, collectionId);
  const copyDelete = await client()
    .from("card_copies")
    .delete()
    .eq("owner_id", ownerId)
    .in("collection_id", ids)
    .is("managed_by", null)
    .select("id");
  if (copyDelete.error) fail(copyDelete.error);

  const { data, error } = await client()
    .from("collections")
    .delete()
    .eq("owner_id", ownerId)
    .eq("id", collectionId)
    .is("managed_by", null)
    .select("id");
  if (error) fail(error);
  if (!data?.length) throw new Error("Not allowed or collection not found");
}

async function ensureCatalogCard(ownerId: string, card: Card): Promise<void> {
  const reference = cardReference(card);
  if (!reference) return;
  const { error } = await client().from("cards").upsert(
    {
      owner_id: ownerId,
      product_id: reference.productId,
      name: reference.name,
      set_name: reference.setName || null,
      number: card.number || null,
      rarity: card.rarity || null,
      image_url: card.image || null,
    },
    { onConflict: "owner_id,product_id", ignoreDuplicates: true }
  );
  if (error) fail(error);
}

const copyFilters = (ownerId: string, collectionId: string, reference: AppCardRef) => [
  ["owner_id", ownerId] as const,
  ["collection_id", collectionId] as const,
  ["product_id", reference.productId] as const,
  ["printing", reference.printing] as const,
  ["status", "active"] as const,
  ["managed_by", null] as const,
];

const applyFilter = <T extends { eq: (column: string, value: string | number) => T; is: (column: string, value: null) => T }>(
  query: T,
  filters: ReturnType<typeof copyFilters>
) => {
  let next = query;
  for (const [column, value] of filters) {
    next = value === null ? next.is(column, null) : next.eq(column, value);
  }
  return next;
};

export async function addCard(
  ownerId: string,
  collectionId: string,
  card: Card
): Promise<void> {
  const reference = cardReference(card);
  if (!reference) return;
  await ensureCatalogCard(ownerId, card);

  const existing = await applyFilter(
    client().from("card_copies").select("id").limit(1),
    copyFilters(ownerId, collectionId, reference)
  );
  if (existing.error) fail(existing.error);
  if (existing.data?.length) return;

  // No condition: the user has not said one, and null means unknown in the shared schema.
  const { error } = await client().from("card_copies").insert({
    owner_id: ownerId,
    collection_id: collectionId,
    product_id: reference.productId,
    printing: reference.printing,
    status: "active",
    managed_by: null,
  });
  if (error) fail(error);
}

export async function removeCard(
  ownerId: string,
  collectionId: string,
  card: Card
): Promise<void> {
  const reference = cardReference(card);
  if (!reference) return;
  const query = applyFilter(
    client().from("card_copies").delete(),
    copyFilters(ownerId, collectionId, reference)
  );
  const { error } = await query;
  if (error) fail(error);
}
