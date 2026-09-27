import { POKEDEX_REGIONS } from "../constants/constants.ts";
import type { PokemonFormData } from "../types/dashboard";

export const formBelongsToRegions = (form: PokemonFormData, regions: string[]): boolean =>
  regions.includes("All") || regions.length === 0 || POKEDEX_REGIONS.some((region) =>
    regions.includes(region.name) && form.number >= region.start && form.number <= region.end
  );
