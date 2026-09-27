import { useEffect, useState, type ChangeEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCardContext } from "../../context/CardContext";
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
  const { pokemonGrouping, setPokemonGrouping } = useCardContext();
  const userId = session?.user.id ?? "";
  const [saved, setSaved] = useState<PokedexProjectsState>(empty);
  const [name, setName] = useState("");
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
      setError("Could not read saved placeholders. The original data was left untouched.");
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
      setError("Could not save placeholders on this device.");
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
      setMessage(project ? `Loaded ${project.name}.` : "Using custom placeholder settings.");
  };

  const createProject = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a placeholder name first.");
      return;
    }
    const project = projectFromGrouping(crypto.randomUUID(), trimmed, pokemonGrouping);
    if (!commit({ ...saved, projects: [...saved.projects, project], activeId: project.id })) return;
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
    if (commit({ ...saved, projects: saved.projects.filter((entry) => entry.id !== active.id), activeId: null })) {
      setMessage(`Deleted ${active.name}. The current view is still available until you change it.`);
    }
  };

  const exportProjects = () => {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pokedex-placeholders.json";
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
        setMessage(`Imported ${copies.length} placeholder${copies.length === 1 ? "" : "s"}.`);
      }
    } catch {
      setError("Could not import this file. No placeholders were changed.");
    }
  };

  return (
    <div className="pokedex-projects">
      <h2>Placeholders</h2>
      <p>Choose a ready-made Pokédex placeholder or save your own set of regions, variants and forms. The selected placeholder applies to the catalog and any collection on this device.</p>
      <label htmlFor="pokedex-project-select">Current placeholder</label>
      <select id="pokedex-project-select" value={saved.activeId ?? ""} onChange={(event) => selectProject(event.target.value)} disabled={blocked}>
        <option value="">Custom placeholder settings</option>
        {saved.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <div className="pokedex-projects__actions">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="New placeholder name" aria-label="New placeholder name" />
        <button type="button" onClick={createProject} disabled={blocked}>Save as new placeholder</button>
        {active && <button type="button" onClick={updateProject} disabled={blocked || !hasUnsavedChanges}>Update {active.name}</button>}
        {active && <button type="button" onClick={deleteProject} disabled={blocked}>Delete placeholder</button>}
      </div>
      <div className="pokedex-projects__actions">
        <button type="button" onClick={exportProjects} disabled={saved.projects.length === 0}>Export placeholders</button>
        {!blocked && <label className="pokedex-projects__import">Import placeholders <input type="file" accept="application/json,.json" onChange={importProjects} /></label>}
      </div>
      {error && <p role="alert" className="auth-card__error">{error}</p>}
      {hasUnsavedChanges && <p role="status">Unsaved placeholder changes. Select Update to keep them.</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
};
