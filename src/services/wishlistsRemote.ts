import { addCard, createCollection, deleteCollection, removeCard } from "./appCollections";
import type { Card } from "../types/dashboard";
import { parseWishlists, storageKey, type SavedCard, type Wishlist } from "./wishlists";
import { supabase } from "./supabase";

type CoreCollection = {
  id: string;
  name: string;
  parent_id: string | null;
  managed_by: string | null;
};

type CoreTag = {
  collection_id: string;
  tag: string;
};

type CoreCopy = {
  collection_id: string;
  product_id: number;
  printing: string | null;
};

const client = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const copyToSavedCard = (copy: CoreCopy): SavedCard => ({
  id: String(copy.product_id),
  era: "",
  productId: Number(copy.product_id),
  printing: copy.printing,
});

/** Reads wishlist roots from `collections` and their physical-copy rows from the core model. */
export async function fetchRemoteWishlists(_userId: string): Promise<Wishlist[]> {
  void _userId;
  const supabaseClient = client();
  const [collections, tags] = await Promise.all([
    supabaseClient
      .from("collections")
      .select("id, name, parent_id, managed_by"),
    supabaseClient.from("collection_tags").select("collection_id, tag").eq("tag", "wish"),
  ]);
  if (collections.error) throw collections.error;
  if (tags.error) throw tags.error;

  const rows = (collections.data ?? []) as CoreCollection[];
  const wishIds = new Set((tags.data ?? []).map((row) => (row as CoreTag).collection_id));
  const roots = rows
    .filter((row) => row.parent_id === null && wishIds.has(row.id) && row.managed_by === null)
    .sort((left, right) => left.name.localeCompare(right.name));
  const rootIds = new Set(roots.map((root) => root.id));
  const childrenByParent = new Map<string, CoreCollection[]>();
  for (const row of rows) {
    if (!row.parent_id || !rootIds.has(row.parent_id) || row.managed_by !== null) continue;
    const children = childrenByParent.get(row.parent_id) ?? [];
    children.push(row);
    childrenByParent.set(row.parent_id, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.name.localeCompare(right.name));
  }

  const subcollectionIds = roots.flatMap((root) =>
    (childrenByParent.get(root.id) ?? []).map((child) => child.id)
  );
  if (subcollectionIds.length === 0) {
    return roots.map((root) => ({ id: root.id, name: root.name, subcollections: [] }));
  }

  const copies = await supabaseClient
    .from("card_copies")
    .select("collection_id, product_id, printing")
    .eq("status", "active")
    .in("collection_id", subcollectionIds);
  if (copies.error) throw copies.error;

  const cardsByCollection = new Map<string, SavedCard[]>();
  for (const copy of (copies.data ?? []) as CoreCopy[]) {
    const cards = cardsByCollection.get(copy.collection_id) ?? [];
    const saved = copyToSavedCard(copy);
    if (!cards.some((card) => card.productId === saved.productId && card.printing === saved.printing)) {
      cards.push(saved);
    }
    cardsByCollection.set(copy.collection_id, cards);
  }

  return roots.map((root) => ({
    id: root.id,
    name: root.name,
    subcollections: (childrenByParent.get(root.id) ?? []).map((child) => ({
      id: child.id,
      name: child.name,
      cards: cardsByCollection.get(child.id) ?? [],
    })),
  }));
}

export const createRemoteCollection = (
  ownerId: string,
  name: string,
  parentId: string | null,
  kind: "owned" | "wishlist"
) => createCollection(ownerId, { name, parentId, kind });

export const deleteRemoteCollection = (ownerId: string, collectionId: string) =>
  deleteCollection(ownerId, collectionId);

export const addRemoteCard = (ownerId: string, collectionId: string, card: Card) =>
  addCard(ownerId, collectionId, card);

export const removeRemoteCard = (ownerId: string, collectionId: string, card: Card) =>
  removeCard(ownerId, collectionId, card);

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
