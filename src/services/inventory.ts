import type { ConditionKey, QuantityKey } from "../types/dashboard";
import { supabase } from "./supabase";

/** Whether the collection is maintained by Collectr or by this application. */
export type CollectionOrigin = "collectr" | "app";
/** The UI meaning of a collection tag. */
export type CollectionKind = "owned" | "wishlist";

type CopyRow = {
  product_id: number;
  collection_id: string;
  condition: string | null;
  printing: string | null;
  managed_by: string | null;
};

type CollectionRow = {
  id: string;
  name: string;
  parent_id: string | null;
  is_public: boolean;
  managed_by: string | null;
};

type CollectionTagRow = {
  collection_id: string;
  tag: string;
};

type CollectionMetaRow = {
  collection_id: string;
  source_active: boolean;
};

type CollectionPrintingRow = {
  collection_id: string;
  printing: string;
};

type CatalogRow = {
  product_id: number;
  name: string;
  set_name: string | null;
  number: string | null;
  rarity: string | null;
  image_url: string | null;
};

type CollectionData = {
  collections: CollectionRow[];
  tags: CollectionTagRow[];
  metadata: CollectionMetaRow[];
};

type InventoryStage =
  | "session"
  | "card_copies"
  | "collections"
  | "collection_tags"
  | "collection_printings"
  | "collectr_collection_meta"
  | "cards";

export class InventoryLoadError extends Error {
  readonly stage: InventoryStage;
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;

  constructor(stage: InventoryStage, cause: unknown) {
    const source = cause as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    super(source?.message || "Unknown Supabase error");
    this.name = "InventoryLoadError";
    this.stage = stage;
    this.code = source?.code;
    this.details = source?.details;
    this.hint = source?.hint;
  }
}

const throwInventoryError = (stage: InventoryStage, error: unknown): never => {
  throw new InventoryLoadError(stage, error);
};

export type InventoryEntry = {
  collectionName: string;
  collectionId: string;
  origin: CollectionOrigin;
  productName: string;
  printing: string | null;
  conditions: Partial<Record<QuantityKey, number>>;
  /** The set name stored in the shared `cards` catalog. */
  catalogGroup: string | null;
  /** Optional catalog fields used to render a collection without the external series API. */
  catalogNumber?: string | null;
  catalogRarity?: string | null;
  catalogImageUrl?: string | null;
};

export type InventorySnapshot = {
  collectionNames: string[];
  entriesByProductId: Map<number, InventoryEntry[]>;
  activeCopyCount: number;
  fetchedAt: number | null;
};

type StoredInventorySnapshot = {
  version: 7;
  userId: string;
  collectionNames: string[];
  entriesByProductId: Array<[number, InventoryEntry[]]>;
  activeCopyCount: number;
  fetchedAt: number;
};

type LoadInventoryOptions = {
  forceRefresh?: boolean;
};

type ClearInventoryCacheOptions = {
  userId?: string;
  includePersistent?: boolean;
};

const conditionKeys = new Set<ConditionKey>([
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
]);
const pageSize = 1000;
const inventoryStoragePrefix = "pokedashboard:inventory:v2:";
let inventoryCache: { userId: string; snapshot: InventorySnapshot } | null = null;
let inventoryPromise: {
  userId: string;
  promise: Promise<InventorySnapshot>;
} | null = null;

export const COLLECTION_PRINTING_ORDER = [
  "Holofoil",
  "Reverse Holofoil",
  "Normal",
  "1st Edition Holofoil",
  "1st Edition",
  "Unlimited Holofoil",
  "Sealed",
  "Listed",
  "Other",
] as const;

const collectionPrintingRank = new Map<string, number>(
  COLLECTION_PRINTING_ORDER.map((printing, index) => [printing, index])
);

const emptyInventory = (): InventorySnapshot => ({
  collectionNames: [],
  entriesByProductId: new Map(),
  activeCopyCount: 0,
  fetchedAt: null,
});

const inventoryStorageKey = (userId: string) =>
  `${inventoryStoragePrefix}${userId}`;

const readStoredInventory = (userId: string): InventorySnapshot | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(inventoryStorageKey(userId));
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredInventorySnapshot>;
    if (
      stored.version !== 7 ||
      stored.userId !== userId ||
      !Array.isArray(stored.collectionNames) ||
      !Array.isArray(stored.entriesByProductId) ||
      typeof stored.activeCopyCount !== "number" ||
      typeof stored.fetchedAt !== "number"
    ) {
      window.sessionStorage.removeItem(inventoryStorageKey(userId));
      return null;
    }
    return {
      collectionNames: stored.collectionNames,
      entriesByProductId: new Map(stored.entriesByProductId),
      activeCopyCount: stored.activeCopyCount,
      fetchedAt: stored.fetchedAt,
    };
  } catch (error) {
    console.warn("[collections] Unable to read the session inventory cache", error);
    return null;
  }
};

const writeStoredInventory = (userId: string, snapshot: InventorySnapshot) => {
  if (typeof window === "undefined" || snapshot.fetchedAt === null) return;
  const stored: StoredInventorySnapshot = {
    version: 7,
    userId,
    collectionNames: snapshot.collectionNames,
    entriesByProductId: [...snapshot.entriesByProductId],
    activeCopyCount: snapshot.activeCopyCount,
    fetchedAt: snapshot.fetchedAt,
  };
  try {
    window.sessionStorage.setItem(
      inventoryStorageKey(userId),
      JSON.stringify(stored)
    );
  } catch (error) {
    console.warn("[collections] Unable to persist the session inventory cache", error);
  }
};

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

const isMissingRelation = (error: unknown) => {
  const value = error as { code?: string; message?: string };
  return value?.code === "42P01" || value?.code === "PGRST205" || /does not exist/i.test(value?.message ?? "");
};

const fetchAllCopies = async (): Promise<CopyRow[]> => {
  const client = requireClient();
  const rows: CopyRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("card_copies")
      .select("product_id, collection_id, condition, printing, managed_by")
      .eq("status", "active")
      .range(from, from + pageSize - 1);
    if (error) throwInventoryError("card_copies", error);
    const page = (data ?? []) as CopyRow[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

const fetchCollectionData = async (): Promise<CollectionData> => {
  const client = requireClient();
  const [collections, tags, metadata] = await Promise.all([
    client
      .from("collections")
      .select("id, name, parent_id, is_public, managed_by"),
    client.from("collection_tags").select("collection_id, tag"),
    client
      .from("collectr_collection_meta")
      .select("collection_id, source_active"),
  ]);
  if (collections.error) throwInventoryError("collections", collections.error);
  if (tags.error) throwInventoryError("collection_tags", tags.error);
  if (metadata.error && !isMissingRelation(metadata.error)) {
    throwInventoryError("collectr_collection_meta", metadata.error);
  }
  return {
    collections: (collections.data ?? []) as CollectionRow[],
    tags: (tags.data ?? []) as CollectionTagRow[],
    // Integration metadata is optional in the shared schema. Missing metadata means
    // application-owned rows remain visible and managed rows are treated as active until
    // the next integration sync supplies their archive marker.
    metadata: (metadata.data ?? []) as CollectionMetaRow[],
  };
};

const fetchCollectionPrintings = async (): Promise<CollectionPrintingRow[]> => {
  const { data, error } = await requireClient()
    .from("collection_printings")
    .select("collection_id, printing");
  if (error) throwInventoryError("collection_printings", error);
  return (data ?? []) as CollectionPrintingRow[];
};

const toActiveCollections = (data: CollectionData): CollectionRow[] => {
  const metadataByCollection = new Map(
    data.metadata.map((row) => [row.collection_id, row.source_active])
  );
  return data.collections.filter(
    (collection) =>
      collection.managed_by !== "collectr" ||
      metadataByCollection.get(collection.id) !== false
  );
};

const collectionTags = (data: CollectionData) => {
  const tagsByCollection = new Map<string, Set<string>>();
  for (const row of data.tags) {
    const tags = tagsByCollection.get(row.collection_id) ?? new Set<string>();
    tags.add(row.tag);
    tagsByCollection.set(row.collection_id, tags);
  }
  return tagsByCollection;
};

const collectionKind = (
  collection: CollectionRow,
  collectionsById: Map<string, CollectionRow>,
  tagsByCollection: Map<string, Set<string>>
): CollectionKind => {
  if (tagsByCollection.get(collection.id)?.has("wish")) return "wishlist";
  const parent = collection.parent_id ? collectionsById.get(collection.parent_id) : undefined;
  return parent ? collectionKind(parent, collectionsById, tagsByCollection) : "owned";
};

/** A collection as the sidebar shows it. */
export type CollectionOption = {
  id: string;
  name: string;
  printings: string[];
  origin: CollectionOrigin;
  kind: CollectionKind;
  parentId: string | null;
  editable: boolean;
  managedBy: string | null;
  isPublic: boolean;
};

const sortCollectionsByPrinting = (
  collections: CollectionRow[],
  printings: CollectionPrintingRow[]
): CollectionRow[] => {
  const ranksByCollection = new Map<string, number>();
  for (const row of printings) {
    const rank = collectionPrintingRank.get(row.printing) ?? Number.MAX_SAFE_INTEGER;
    const currentRank = ranksByCollection.get(row.collection_id);
    if (currentRank === undefined || rank < currentRank) {
      ranksByCollection.set(row.collection_id, rank);
    }
  }

  return [...collections].sort((left, right) => {
    const printingDifference =
      (ranksByCollection.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (ranksByCollection.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    if (printingDifference !== 0) return printingDifference;
    return left.name.localeCompare(right.name);
  });
};

export const loadCollectionOptions = async (): Promise<CollectionOption[]> => {
  const [data, collectionPrintings] = await Promise.all([
    fetchCollectionData(),
    fetchCollectionPrintings(),
  ]);
  const activeCollections = toActiveCollections(data);
  const activeIds = new Set(activeCollections.map((collection) => collection.id));
  const tagsByCollection = collectionTags(data);
  const collectionsById = new Map(data.collections.map((collection) => [collection.id, collection]));
  const printingsByCollection = new Map<string, string[]>();

  for (const row of collectionPrintings) {
    if (!activeIds.has(row.collection_id)) continue;
    const printings = printingsByCollection.get(row.collection_id) ?? [];
    if (!printings.includes(row.printing)) printings.push(row.printing);
    printingsByCollection.set(row.collection_id, printings);
  }
  for (const printings of printingsByCollection.values()) {
    printings.sort(
      (left, right) =>
        (collectionPrintingRank.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (collectionPrintingRank.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        left.localeCompare(right)
    );
  }

  return sortCollectionsByPrinting(activeCollections, collectionPrintings).map((collection) => {
    const managedBy = collection.managed_by;
    return {
      id: collection.id,
      name: collection.name,
      printings: printingsByCollection.get(collection.id) ?? [],
      origin: managedBy === "collectr" ? "collectr" : "app",
      kind: collectionKind(collection, collectionsById, tagsByCollection),
      parentId: collection.parent_id,
      editable: managedBy === null,
      managedBy,
      isPublic: collection.is_public,
    };
  });
};

const fetchProductCatalog = async (productIds: number[]) => {
  const catalog = new Map<number, CatalogRow>();
  if (productIds.length === 0) return catalog;
  const client = requireClient();
  const chunkSize = 200;
  for (let index = 0; index < productIds.length; index += chunkSize) {
    const { data, error } = await client
      .from("cards")
      .select("product_id, name, set_name, number, rarity, image_url")
      .in("product_id", productIds.slice(index, index + chunkSize));
    if (error) throwInventoryError("cards", error);
    for (const row of (data ?? []) as CatalogRow[]) {
      catalog.set(Number(row.product_id), row);
    }
  }
  return catalog;
};

const createSnapshot = async (): Promise<InventorySnapshot> => {
  const [copies, collectionData, collectionPrintings] = await Promise.all([
    fetchAllCopies(),
    fetchCollectionData(),
    fetchCollectionPrintings(),
  ]);
  const activeCollections = toActiveCollections(collectionData);
  const collections = sortCollectionsByPrinting(activeCollections, collectionPrintings);
  const collectionsById = new Map(
    collections.map((collection) => [collection.id, collection])
  );
  const productIds = [...new Set(copies.map((copy) => Number(copy.product_id)))];
  const productCatalog = await fetchProductCatalog(productIds);
  const byProduct = new Map<number, Map<string, InventoryEntry>>();

  for (const copy of copies) {
    const collection = collectionsById.get(copy.collection_id);
    if (!collection) continue;
    const productId = Number(copy.product_id);
    const catalog = productCatalog.get(productId);
    const entries = bucketFor(byProduct, productId);
    const entryKey = `${collection.id}\u0000${copy.printing ?? ""}`;
    const entry = entries.get(entryKey) ?? {
      collectionName: collection.name,
      collectionId: collection.id,
      origin: collection.managed_by === "collectr" ? "collectr" : "app",
      productName: catalog?.name ?? "",
      printing: copy.printing,
      conditions: {},
      catalogGroup: catalog?.set_name ?? null,
      catalogNumber: catalog?.number ?? null,
      catalogRarity: catalog?.rarity ?? null,
      catalogImageUrl: catalog?.image_url ?? null,
    };
    // A copy with no recognised condition is still a copy the user holds.
    const condition: QuantityKey =
      copy.condition && conditionKeys.has(copy.condition as ConditionKey)
        ? (copy.condition as ConditionKey)
        : "Unknown";
    entry.conditions[condition] = (entry.conditions[condition] ?? 0) + 1;
    entries.set(entryKey, entry);
  }

  return {
    collectionNames: collections
      .filter((collection) => collection.parent_id === null)
      .map((collection) => collection.name),
    entriesByProductId: flattenEntries(byProduct),
    activeCopyCount: copies.filter((copy) => collectionsById.has(copy.collection_id)).length,
    fetchedAt: Date.now(),
  };
};

/** The per-collection map for one product, created on first use. */
const bucketFor = <K>(source: Map<K, Map<string, InventoryEntry>>, key: K) => {
  const existing = source.get(key);
  if (existing) return existing;
  const created = new Map<string, InventoryEntry>();
  source.set(key, created);
  return created;
};

const flattenEntries = <K>(source: Map<K, Map<string, InventoryEntry>>) =>
  new Map<K, InventoryEntry[]>(
    [...source].map(([key, entries]) => [key, [...entries.values()]])
  );

const isSignedOutError = (error: unknown) => {
  const value = error as { name?: string; code?: string };
  return value?.name === "AuthSessionMissingError" || value?.code === "auth_session_missing";
};

export const loadInventory = async (
  options: LoadInventoryOptions = {}
): Promise<InventorySnapshot> => {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError && !isSignedOutError(userError)) {
    throwInventoryError("session", userError);
  }
  const userId = userData.user?.id;
  if (!userId) return emptyInventory();

  if (!options.forceRefresh) {
    if (inventoryCache?.userId === userId) return inventoryCache.snapshot;
    const stored = readStoredInventory(userId);
    if (stored) {
      inventoryCache = { userId, snapshot: stored };
      return stored;
    }
  }

  if (inventoryPromise?.userId === userId) return inventoryPromise.promise;

  const promise = createSnapshot()
    .then((snapshot) => {
      inventoryCache = { userId, snapshot };
      writeStoredInventory(userId, snapshot);
      return snapshot;
    })
    .finally(() => {
      if (inventoryPromise?.promise === promise) inventoryPromise = null;
    });
  inventoryPromise = { userId, promise };
  return promise;
};

export const clearInventoryCache = (
  options: ClearInventoryCacheOptions = {}
) => {
  const cachedUserId = inventoryCache?.userId;
  inventoryPromise = null;
  inventoryCache = null;
  if (options.includePersistent && typeof window !== "undefined") {
    const userId = options.userId ?? cachedUserId;
    if (userId) window.sessionStorage.removeItem(inventoryStorageKey(userId));
  }
};

export const describeInventoryError = (error: unknown): string => {
  if (error instanceof InventoryLoadError) {
    return [
      `stage=${error.stage}`,
      error.code && `code=${error.code}`,
      `message=${error.message}`,
      error.details && `details=${error.details}`,
      error.hint && `hint=${error.hint}`,
    ]
      .filter(Boolean)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
};
