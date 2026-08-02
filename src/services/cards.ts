import { loadJSONFile } from "../utils/utils";
import type { Set, PokemonFormData } from "../types/dashboard";
import type { HierarchySerie } from "../types/source-card";

const API_BASE_URL =
  import.meta.env.VITE_POKE_DB_API_BASE_URL ||
  "/api/poke-db";

let hierarchyPromise: Promise<HierarchySerie[]> | null = null;
let pokemonFormsPromise: Promise<PokemonFormData[]> | null = null;

export const loadHierarchy = (): Promise<HierarchySerie[]> => {
  if (!hierarchyPromise) {
    hierarchyPromise = loadJSONFile<HierarchySerie[]>(
      `${API_BASE_URL}/navigation/cards-hierarchy`
    ).catch((error) => {
      hierarchyPromise = null;
      throw error;
    });
  }
  return hierarchyPromise;
};

export const loadSets = async (): Promise<Set[]> => {
  const hierarchy = await loadHierarchy();

  return hierarchy.flatMap((serie) =>
    serie.sets.map((set) => ({
      id: String(set.id),
      name: set.name,
      series: serie.name,
      printedTotal: 0,
      total: 0,
      legalities: { unlimited: "" },
      ptcgoCode: "",
      releaseDate: "",
      updatedAt: "",
      symbolImage: set.symbolImage || null,
      images: {
        symbol: set.symbolImage || "",
        logo: "",
      },
    }))
  );
};

export const loadPokemonForms = async (): Promise<PokemonFormData[]> => {
  if (!pokemonFormsPromise) {
    pokemonFormsPromise = loadJSONFile<PokemonFormData[]>(
      `${API_BASE_URL}/pokemon-forms`
    ).catch((error) => {
      pokemonFormsPromise = null;
      throw error;
    });
  }
  return pokemonFormsPromise;
};
