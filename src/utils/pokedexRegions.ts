import { POKEDEX_REGIONS, getRegionForPokedexNumber } from "../constants/constants.ts";
import type { Card, PokemonFormData } from "../types/dashboard";
import { getEvolutionFamilyAnchor } from "./pokedexEvolution.ts";

export const getPokedexRegion = (number: number, evolutionary = false): string | null =>
  getRegionForPokedexNumber(evolutionary ? getEvolutionFamilyAnchor(number) : number);

export const pokedexNumberBelongsToRegions = (number: number, regions: string[], evolutionary = false): boolean =>
  regions.includes("All") || regions.length === 0 || regions.includes(getPokedexRegion(number, evolutionary) ?? "");

export const formBelongsToRegions = (
  form: Pick<PokemonFormData, "number">, regions: string[], evolutionary = false
): boolean => pokedexNumberBelongsToRegions(form.number, regions, evolutionary);

/** A view-local projection keeps region filtering, exclusions and facet counts in sync. */
export const cardsWithEvolutionFamilyRegions = (cards: Card[]): Card[] => cards.map((card) => {
  const number = card.nationalPokedexNumbers?.[0];
  const region = number === undefined ? null : getPokedexRegion(number, true);
  return region && region !== card.pokedexRegion ? { ...card, pokedexRegion: region } : card;
});

export const pokedexNumbersInRegion = (region: string, evolutionary = false): number[] =>
  Array.from({ length: POKEDEX_REGIONS[POKEDEX_REGIONS.length - 1].end }, (_, index) => index + 1)
    .filter((number) => pokedexNumberBelongsToRegions(number, [region], evolutionary));
