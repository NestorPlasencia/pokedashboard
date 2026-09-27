import type { PokemonGroupingOptions } from "../types/dashboard";
import { POKEDEX_REGIONS } from "../constants/constants.ts";

export type PokedexProject = Pick<PokemonGroupingOptions,
  "groupingRegions" | "allowVariants" | "hideVariants" | "excludedFormIds" | "fallbackToDefault"
> & {
  id: string;
  name: string;
};

export type PokedexProjectsState = {
  projects: PokedexProject[];
  activeId: string | null;
  presetVersion?: number;
};

const PRESET_VERSION = 1;
const baseProject = (id: string, name: string, groupingRegions: string[]): PokedexProject => ({
  id, name, groupingRegions, allowVariants: ["Default"], hideVariants: [],
  excludedFormIds: [], fallbackToDefault: false,
});

export const POKEDEX_PRESETS: PokedexProject[] = [
  baseProject("preset-national-1025", "National · 1–1025", ["All"]),
  ...POKEDEX_REGIONS.map((region) =>
    baseProject(`preset-region-${region.name.toLowerCase()}`, `${region.name} · ${region.start}–${region.end}`, [region.name])
  ),
  ...POKEDEX_REGIONS.slice(1).map((region, index) =>
    baseProject(`preset-kanto-to-${region.name.toLowerCase()}`, `Kanto–${region.name} · 1–${region.end}`,
      POKEDEX_REGIONS.slice(0, index + 2).map((entry) => entry.name))
  ),
];

const emptyState = (): PokedexProjectsState => ({
  projects: POKEDEX_PRESETS.map((project) => ({ ...project, groupingRegions: [...project.groupingRegions], allowVariants: [...project.allowVariants] })),
  activeId: POKEDEX_PRESETS[0].id,
  presetVersion: PRESET_VERSION,
});
const storageKey = (userId: string) => `pokedashboard:pokedex-projects:${userId || "guest"}`;

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const formIds = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => Number.isInteger(item) && item > 0);

export const parsePokedexProjects = (raw: unknown): PokedexProjectsState => {
  if (!raw || typeof raw !== "object") throw new Error("Invalid Pokédex file.");
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.projects)) throw new Error("Invalid Pokédex file.");
  const projects = value.projects.map((entry): PokedexProject => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid Pokédex.");
    const project = entry as Record<string, unknown>;
    if (
      typeof project.id !== "string" || !project.id ||
      typeof project.name !== "string" || !project.name.trim() ||
      !strings(project.groupingRegions) || !strings(project.allowVariants) ||
      !strings(project.hideVariants) || !formIds(project.excludedFormIds) ||
      typeof project.fallbackToDefault !== "boolean"
    ) throw new Error("Invalid Pokédex.");
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
  return { projects, activeId, presetVersion: value.presetVersion === PRESET_VERSION ? PRESET_VERSION : undefined };
};

export const readPokedexProjects = (userId: string): PokedexProjectsState => {
  const saved = window.localStorage.getItem(storageKey(userId));
  if (!saved) return emptyState();
  const state = parsePokedexProjects(JSON.parse(saved));
  if (state.presetVersion === PRESET_VERSION) return state;
  const existingIds = new Set(state.projects.map((project) => project.id));
  return {
    ...state,
    projects: [...POKEDEX_PRESETS.filter((project) => !existingIds.has(project.id)), ...state.projects],
    presetVersion: PRESET_VERSION,
  };
};

export const writePokedexProjects = (userId: string, state: PokedexProjectsState): void => {
  window.localStorage.setItem(storageKey(userId), JSON.stringify({ ...state, presetVersion: PRESET_VERSION }));
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
  groupingRegions: [...project.groupingRegions],
  allowVariants: [...project.allowVariants],
  hideVariants: [...project.hideVariants],
  excludedFormIds: [...project.excludedFormIds],
  fallbackToDefault: project.fallbackToDefault,
});
