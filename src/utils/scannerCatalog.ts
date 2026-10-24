import type { Card, PokemonFormWithoutCard, PokemonWithoutCard } from '../types/dashboard';

/** The scanner shares the final catalog results, including search and collection filters. */
export function scannerCatalogCards(results: (Card | PokemonWithoutCard | PokemonFormWithoutCard)[]): Card[] {
  const cards = results.filter((card): card is Card => 'setId' in card);
  return [...new Map(cards.map(card => [JSON.stringify([card.id, card.printing || card.variant]), card])).values()];
}
