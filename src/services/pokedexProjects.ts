import type { PokemonGroupingOptions } from "../types/dashboard";

export type PokedexProject = Pick<PokemonGroupingOptions,
  "groupingRegions" | "allowVariants" | "hideVariants" | "excludedFormIds" | "fallbackToDefault"
> & {
  id: string;
  name: string;
};

export type PokedexProjectsState = {
  projects: PokedexProject[];
  activeId: string | null;
};

const emptyState = (): PokedexProjectsState => ({ projects: [], activeId: null });
const storageKey = (userId: string) => `pokedashboard:pokedex-projects:${userId || "guest"}`;

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const formIds = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => Number.isInteger(item) && item > 0);

export const parsePokedexProjects = (raw: unknown): PokedexProjectsState => {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Pokédex projects file.");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.projects)) throw new Error("Invalid Pokédex projects file.");
  const projects = value.projects.map((entry): PokedexProject => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid Pokédex project.");
    const project = entry as Record<string, unknown>;
    if (
      typeof project.id !== "string" || !project.id ||
      typeof project.name !== "string" || !project.name.trim() ||
      !strings(project.groupingRegions) || !strings(project.allowVariants) ||
      !strings(project.hideVariants) || !formIds(project.excludedFormIds) ||
      typeof project.fallbackToDefault !== "boolean"
    ) throw new Error("Invalid Pokédex project.");
    return {
      id: project.id,
      name: project.name.trim(),
      groupingRegions: project.groupingRegions,
      allowVariants: project.allowVariants,
      hideVariants: project.hideVariants,
      excludedFormIds: project.excludedFormIds,
      fallbackToDefault: project.fallbackToDefault,
    };
  });
  const activeId = typeof value.activeId === "string" && projects.some((project) => project.id === value.activeId)
    ? value.activeId : null;
  return { projects, activeId };
};

export const readPokedexProjects = (userId: string): PokedexProjectsState => {
  const saved = window.localStorage.getItem(storageKey(userId));
  return saved ? parsePokedexProjects(JSON.parse(saved)) : emptyState();
};

export const writePokedexProjects = (userId: string, state: PokedexProjectsState): void => {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
};

export const projectFromGrouping = (
  id: string,
  name: string,
  grouping: PokemonGroupingOptions
): PokedexProject => ({
  id,
  name: name.trim(),
  groupingRegions: [...grouping.groupingRegions],
  allowVariants: [...grouping.allowVariants],
  hideVariants: [...grouping.hideVariants],
  excludedFormIds: [...grouping.excludedFormIds],
  fallbackToDefault: grouping.fallbackToDefault,
});

export const applyPokedexProject = (
  grouping: PokemonGroupingOptions,
  project: PokedexProject
): PokemonGroupingOptions => ({
  ...grouping,
  enabled: true,
  groupingRegions: [...project.groupingRegions],
  allowVariants: [...project.allowVariants],
  hideVariants: [...project.hideVariants],
  excludedFormIds: [...project.excludedFormIds],
  fallbackToDefault: project.fallbackToDefault,
});
