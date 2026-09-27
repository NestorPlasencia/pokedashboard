import type { Card, PokemonFormData, PokemonFormWithoutCard, PokemonGroupingOptions } from "../types/dashboard";

type FormGroup = { form: PokemonFormData; cards: (Card | PokemonFormWithoutCard)[] };

export const orderPokedexGroupNames = (
  forms: PokemonFormData[],
  groups: Record<string, FormGroup>,
  order: PokemonGroupingOptions["groupSortBy"],
  selectedCollections: string[] = []
): string[] => {
  const names = forms.map((form) => form.name).filter((name) => groups[name] !== undefined);
  if (order === "default") return names;
  const collectionScope = new Set(selectedCollections);
  const count = (name: string): number => groups[name].cards.reduce((total, item) => {
    if ("isPlaceholder" in item) return total;
    if (order === "cardCount" || order === "cardCountDesc") return total + 1;
    return total + (item.collections ?? [])
      .filter((collection) => collectionScope.size === 0 || collectionScope.has(collection.name))
      .reduce((copies, collection) => copies + Object.values(collection.quantity ?? {})
        .reduce((sum, quantity) => sum + (quantity ?? 0), 0), 0);
  }, 0);
  const counts = new Map(names.map((name) => [name, count(name)]));
  const direction = order === "cardCountDesc" || order === "ownedCountDesc" ? -1 : 1;
  return names.sort((a, b) => ((counts.get(a) ?? 0) - (counts.get(b) ?? 0)) * direction);
};
