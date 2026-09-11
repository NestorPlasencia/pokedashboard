/**
 * Collections nest through `parentId`. Everything downstream still addresses a collection
 * by its name - the view mode, the filter, the inventory entries - so the tree is mostly
 * used to answer one question: which names does a collection stand for once its
 * subcollections are counted in.
 */
type TreeNode = { id: string; name: string; parentId: string | null };

/** Direct children of each collection, by parent id, in the order given. */
export const childrenByParent = <T extends TreeNode>(collections: T[]): Map<string, T[]> => {
  const children = new Map<string, T[]>();
  for (const collection of collections) {
    if (!collection.parentId) continue;
    const siblings = children.get(collection.parentId) ?? [];
    siblings.push(collection);
    children.set(collection.parentId, siblings);
  }
  return children;
};

/**
 * A collection followed by every collection nested under it, at any depth. Empty when no
 * collection has that name. A parent loop in bad data is walked once rather than forever.
 */
export const collectionSubtree = <T extends TreeNode>(collections: T[], rootName: string): T[] => {
  const root = collections.find((collection) => collection.name === rootName);
  if (!root) return [];
  const children = childrenByParent(collections);
  const subtree: T[] = [];
  const seen = new Set<string>();
  const queue: T[] = [root];
  while (queue.length > 0) {
    const collection = queue.shift()!;
    const key = collection.id || collection.name;
    if (seen.has(key)) continue;
    seen.add(key);
    subtree.push(collection);
    if (collection.id) queue.push(...(children.get(collection.id) ?? []));
  }
  return subtree;
};

/**
 * The names a viewed collection covers: itself and its subcollections. A name the list
 * does not know yet - still loading, or from an old link - covers just itself.
 */
export const collectionScopeNames = <T extends TreeNode>(collections: T[], name: string): string[] => {
  const subtree = collectionSubtree(collections, name);
  return subtree.length > 0 ? subtree.map((collection) => collection.name) : [name];
};
