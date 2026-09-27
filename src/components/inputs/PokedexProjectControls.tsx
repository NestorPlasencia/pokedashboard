import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCardContext } from "../../context/CardContext";
import { shouldIncludePokemonForm } from "../../utils/filters";
import {
  applyPokedexProject,
  parsePokedexProjects,
  projectFromGrouping,
  readPokedexProjects,
  writePokedexProjects,
  type PokedexProjectsState,
} from "../../services/pokedexProjects";

const empty: PokedexProjectsState = { projects: [], activeId: null };

export const PokedexProjectControls = () => {
  const { session, isAuthLoading } = useAuth();
  const { pokemonGrouping, setPokemonGrouping, pokemonFormsData } = useCardContext();
  const userId = session?.user.id ?? "";
  const [saved, setSaved] = useState<PokedexProjectsState>(empty);
  const [name, setName] = useState("");
  const [formSearch, setFormSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (isAuthLoading) return;
    try {
      setSaved(readPokedexProjects(userId));
      setError("");
      setBlocked(false);
    } catch {
      setSaved(empty);
      setBlocked(true);
      setError("Could not read saved projects. The original data was left untouched.");
    }
  }, [isAuthLoading, userId]);

  const commit = (next: PokedexProjectsState): boolean => {
    if (blocked) return false;
    try {
      writePokedexProjects(userId, next);
      setSaved(next);
      setError("");
      return true;
    } catch {
      setError("Could not save projects on this device.");
      return false;
    }
  };

  const active = saved.projects.find((project) => project.id === saved.activeId);
  const hasUnsavedChanges = Boolean(active && (
    JSON.stringify(active.groupingRegions) !== JSON.stringify(pokemonGrouping.groupingRegions) ||
    JSON.stringify(active.allowVariants) !== JSON.stringify(pokemonGrouping.allowVariants) ||
    JSON.stringify(active.hideVariants) !== JSON.stringify(pokemonGrouping.hideVariants) ||
    JSON.stringify(active.excludedFormIds) !== JSON.stringify(pokemonGrouping.excludedFormIds) ||
    active.fallbackToDefault !== pokemonGrouping.fallbackToDefault
  ));
  const selectProject = (id: string) => {
    const project = saved.projects.find((entry) => entry.id === id);
    if (!commit({ ...saved, activeId: project?.id ?? null })) return;
    if (project) setPokemonGrouping((current) => applyPokedexProject(current, project));
    setMessage(project ? `Loaded ${project.name}.` : "Using custom settings.");
  };

  const createProject = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a project name first.");
      return;
    }
    const project = projectFromGrouping(crypto.randomUUID(), trimmed, pokemonGrouping);
    if (!commit({ projects: [...saved.projects, project], activeId: project.id })) return;
    setPokemonGrouping((current) => ({ ...current, enabled: true }));
    setName("");
    setMessage(`Saved ${project.name}.`);
  };

  const updateProject = () => {
    if (!active) return;
    const updated = projectFromGrouping(active.id, active.name, pokemonGrouping);
    if (commit({ ...saved, projects: saved.projects.map((entry) => entry.id === active.id ? updated : entry) })) {
      setMessage(`Updated ${active.name}.`);
    }
  };

  const deleteProject = () => {
    if (!active) return;
    if (commit({ projects: saved.projects.filter((entry) => entry.id !== active.id), activeId: null })) {
      setMessage(`Deleted ${active.name}. The current view is still available until you change it.`);
    }
  };

  const exportProjects = () => {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pokedex-projects.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importProjects = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parsePokedexProjects(JSON.parse(await file.text()));
      const copies = imported.projects.map((project) => ({ ...project, id: crypto.randomUUID() }));
      if (commit({ ...saved, projects: [...saved.projects, ...copies] })) {
        setMessage(`Imported ${copies.length} project${copies.length === 1 ? "" : "s"}.`);
      }
    } catch {
      setError("Could not import this file. No projects were changed.");
    }
  };

  const candidateForms = useMemo(() => {
    const regions = pokemonGrouping.groupingRegions;
    return pokemonFormsData
      .filter((form) =>
        (regions.includes("All") || form.regions.some((entry) => regions.includes(entry.region.name))) &&
        shouldIncludePokemonForm(form, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants)
      )
      .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  }, [pokemonFormsData, pokemonGrouping.groupingRegions, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants]);

  const visibleForms = useMemo(() => {
    const query = formSearch.trim().toLowerCase();
    return candidateForms.filter((form) =>
      !query || form.name.toLowerCase().includes(query) ||
      form.pokemon.name.toLowerCase().includes(query) || String(form.number).includes(query)
    ).slice(0, 100);
  }, [candidateForms, formSearch]);

  const toggleForm = (id: number) => {
    setPokemonGrouping((current) => ({
      ...current,
      excludedFormIds: current.excludedFormIds.includes(id)
        ? current.excludedFormIds.filter((entry) => entry !== id)
        : [...current.excludedFormIds, id],
    }));
    setMessage(active ? "Save changes to update this project." : "Save a project to keep these changes.");
  };

  return (
    <div className="pokedex-projects">
      <h3>Pokédex projects</h3>
      <p>Save a set of regions, variants and individual forms. The selected project applies to the catalog and any collection on this device.</p>
      <label htmlFor="pokedex-project-select">Current project</label>
      <select id="pokedex-project-select" value={saved.activeId ?? ""} onChange={(event) => selectProject(event.target.value)} disabled={blocked}>
        <option value="">Custom settings</option>
        {saved.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <div className="pokedex-projects__actions">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New project name" aria-label="New project name" />
        <button type="button" onClick={createProject} disabled={blocked}>Save as new project</button>
        {active && <button type="button" onClick={updateProject} disabled={blocked || !hasUnsavedChanges}>Update {active.name}</button>}
        {active && <button type="button" onClick={deleteProject} disabled={blocked}>Delete project</button>}
      </div>
      <div className="pokedex-projects__actions">
        <button type="button" onClick={exportProjects} disabled={saved.projects.length === 0}>Export projects</button>
        {!blocked && <label className="pokedex-projects__import">Import projects <input type="file" accept="application/json,.json" onChange={importProjects} /></label>}
      </div>
      {error && <p role="alert" className="auth-card__error">{error}</p>}
      {hasUnsavedChanges && <p role="status">Unsaved project changes. Select Update to keep them.</p>}
      {message && <p role="status">{message}</p>}
      {pokemonGrouping.enabled && <details className="pokedex-projects__forms">
        <summary>Individual forms ({candidateForms.length - candidateForms.filter((form) => pokemonGrouping.excludedFormIds.includes(form.id)).length}/{candidateForms.length} included)</summary>
        <p>Choose regions and variants below, then remove any form that does not belong in this project. Save your changes when finished.</p>
        <input value={formSearch} onChange={(event) => setFormSearch(event.target.value)} placeholder="Find a Pokémon or form" aria-label="Find a Pokémon or form" />
        <div className="pokedex-projects__form-list">
          {visibleForms.map((form) => {
            const excluded = pokemonGrouping.excludedFormIds.includes(form.id);
            return (
              <div className="pokedex-projects__form" key={form.id}>
                <span>#{form.number} {form.name}</span>
                <button type="button" onClick={() => toggleForm(form.id)} aria-label={`${excluded ? "Restore" : "Remove"} ${form.name}`}>
                  {excluded ? "Restore" : "Remove"}
                </button>
              </div>
            );
          })}
          {candidateForms.length === 0 && <p>{pokemonFormsData.length === 0 ? "Form catalog is loading or unavailable." : "No forms match these regions and variants."}</p>}
        </div>
        {candidateForms.length > 100 && <small>Showing up to 100 forms. Search to find another.</small>}
      </details>}
    </div>
  );
};
