import { POKEMON_EVOLUTION_FAMILIES } from '../data/pokemonEvolutionFamilies.ts';

const evolutionOrder = new Map<number, readonly [number, number]>();
for (const family of POKEMON_EVOLUTION_FAMILIES) {
  // Anchor at the family's earliest national number, even when its baby came later.
  const anchor = Math.min(...family);
  family.forEach((number, index) => evolutionOrder.set(number, [anchor, index]));
}

/** The species that first placed this family in the national Pokédex. */
export const getEvolutionFamilyAnchor = (number: number): number =>
  evolutionOrder.get(number)?.[0] ?? number;

/** All forms of a species stay together; missing species sort after numbered Pokémon. */
export const compareEvolutionaryPokedexNumbers = (a?: number, b?: number): number => {
  const key = (number?: number): readonly [number, number] => {
    if (number === undefined || !Number.isInteger(number) || number <= 0) {
      return [Number.MAX_SAFE_INTEGER, 0];
    }
    return evolutionOrder.get(number) ?? [number, 0];
  };
  const [aFamily, aPosition] = key(a);
  const [bFamily, bPosition] = key(b);
  return aFamily - bFamily || aPosition - bPosition;
};
