import type { ConditionKey } from "../types/dashboard";
import { supabase } from "./supabase";

type CopyRow = {
  product_id: number;
  collection_id: string;
  condition: string;
  printing: string | null;
};

type CollectionRow = {
  id: string;
  name: string;
  ordering: number;
};

type CollectionPrintingRow = {
  collection_id: string;
  printing: string;
};

type CatalogRow = {
  product_id: number;
  product_name: string;
};

type InventoryStage =
  | "session"
  | "card_copies"
  | "collectr_collections"
  | "collection_printings"
  | "collectr_cards";

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
  productName: string;
  printing: string | null;
  conditions: Partial<Record<ConditionKey, number>>;
};

export type InventorySnapshot = {
  collectionNames: string[];
  entriesByProductId: Map<number, InventoryEntry[]>;
  activeCopyCount: number;
};

const conditionKeys = new Set<ConditionKey>([
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
]);
const pageSize = 1000;
let inventoryPromise: Promise<InventorySnapshot> | null = null;

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
});

const fetchAllCopies = async (): Promise<CopyRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const rows: CopyRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("card_copies")
      .select("product_id, collection_id, condition, printing")
      .eq("status", "active")
      .range(from, from + pageSize - 1);
    if (error) throwInventoryError("card_copies", error);
    const page = (data ?? []) as CopyRow[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

const fetchActiveCollections = async (): Promise<CollectionRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("collectr_collections")
    .select("id, name, ordering")
    .eq("source_active", true)
    .order("ordering", { ascending: true });
  if (error) throwInventoryError("collectr_collections", error);
  return (data ?? []) as CollectionRow[];
};

const fetchCollectionPrintings = async (): Promise<CollectionPrintingRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("collection_printings")
    .select("collection_id, printing");
  if (error) throwInventoryError("collection_printings", error);
  return (data ?? []) as CollectionPrintingRow[];
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
    if (left.ordering !== right.ordering) return left.ordering - right.ordering;
    return left.name.localeCompare(right.name);
  });
};

const fetchProductNames = async (productIds: number[]) => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const names = new Map<number, string>();
  if (productIds.length === 0) return names;
  const chunkSize = 200;
  for (let index = 0; index < productIds.length; index += chunkSize) {
    const { data, error } = await supabase
      .from("collectr_cards")
      .select("product_id, product_name")
      .in("product_id", productIds.slice(index, index + chunkSize));
    if (error) throwInventoryError("collectr_cards", error);
    for (const row of (data ?? []) as CatalogRow[]) {
      names.set(Number(row.product_id), row.product_name);
    }
  }
  return names;
};

const createSnapshot = async (): Promise<InventorySnapshot> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throwInventoryError("session", sessionError);
  if (!sessionData.session) return emptyInventory();

  const [copies, activeCollections, collectionPrintings] = await Promise.all([
    fetchAllCopies(),
    fetchActiveCollections(),
    fetchCollectionPrintings(),
  ]);
  const collections = sortCollectionsByPrinting(
    activeCollections,
    collectionPrintings
  );
  const collectionNamesById = new Map(
    collections.map((collection) => [collection.id, collection.name])
  );
  const productIds = [...new Set(copies.map((copy) => Number(copy.product_id)))];
  const productNames = await fetchProductNames(productIds);
  const aggregate = new Map<number, Map<string, InventoryEntry>>();

  for (const copy of copies) {
    const collectionName = collectionNamesById.get(copy.collection_id);
    if (!collectionName) continue;
    const productId = Number(copy.product_id);
    if (!aggregate.has(productId)) aggregate.set(productId, new Map());
    const byCollection = aggregate.get(productId)!;
    const entryKey = `${collectionName}\u0000${copy.printing ?? ""}`;
    const entry = byCollection.get(entryKey) ?? {
      collectionName,
      productName: productNames.get(productId) ?? "",
      printing: copy.printing,
      conditions: {},
    };
    if (conditionKeys.has(copy.condition as ConditionKey)) {
      const condition = copy.condition as ConditionKey;
      entry.conditions[condition] = (entry.conditions[condition] ?? 0) + 1;
    }
    byCollection.set(entryKey, entry);
  }

  return {
    collectionNames: collections.map((collection) => collection.name),
    entriesByProductId: new Map(
      [...aggregate].map(([productId, entries]) => [
        productId,
        [...entries.values()],
      ])
    ),
    activeCopyCount: copies.length,
  };
};

export const loadInventory = (): Promise<InventorySnapshot> => {
  if (!inventoryPromise) {
    inventoryPromise = createSnapshot().catch((error) => {
      inventoryPromise = null;
      throw error;
    });
  }
  return inventoryPromise;
};

export const clearInventoryCache = () => {
  inventoryPromise = null;
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
