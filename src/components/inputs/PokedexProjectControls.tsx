import { useEffect, useState, type ChangeEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCardContext } from "../../context/CardContext";
import {
  applyPokedexProject,
  parsePokedexProjects,
  POKEDEX_PRESETS,
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
      setError("Could not read saved Pokédexes. The original data was left untouched.");
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
      setError("Could not save Pokédexes on this device.");
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
    setPokemonGrouping((current) => project
      ? applyPokedexProject(current, project)
      : { ...current, enabled: false });
    setMessage("");
  };

  const toggleGrouping = (enabled: boolean) => {
    if (!enabled || active) {
      setPokemonGrouping((current) => ({ ...current, enabled }));
      return;
    }
    const national = saved.projects.find((project) => project.id === POKEDEX_PRESETS[0].id) ?? POKEDEX_PRESETS[0];
    const projects = saved.projects.some((project) => project.id === national.id)
      ? saved.projects : [national, ...saved.projects];
    if (!commit({ ...saved, projects, activeId: national.id })) return;
    setPokemonGrouping((current) => ({ ...applyPokedexProject(current, national), enabled: true }));
    setMessage("");
  };

  const createProject = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a Pokédex name first.");
      return;
    }
    const project = projectFromGrouping(crypto.randomUUID(), trimmed, pokemonGrouping);
    if (!commit({ ...saved, projects: [...saved.projects, project], activeId: project.id })) return;
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
      setPokemonGrouping((current) => ({ ...current, enabled: false }));
      setMessage(`Deleted ${active.name}. Group by Pokédex is now off.`);
    }
  };

  const exportProjects = () => {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pokedexes.json";
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
        setMessage(`Imported ${copies.length} Pokédex${copies.length === 1 ? "" : "es"}.`);
      }
    } catch {
      setError("Could not import this file. No Pokédexes were changed.");
    }
  };

  return (
    <div className="pokedex-projects">
      <div className="pokedex-projects__heading">
        <label htmlFor="pokedex-project-select">Current Pokédex</label>
        <small>Saved on this device</small>
      </div>
      <select id="pokedex-project-select" value={saved.activeId ?? ""} onChange={(event) => selectProject(event.target.value)} disabled={blocked}>
        <option value="">Custom Pokédex settings</option>
        {saved.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <label className="pokedex-projects__toggle">
        <input
          type="checkbox"
          checked={pokemonGrouping.enabled && Boolean(active)}
          onChange={(event) => toggleGrouping(event.target.checked)}
          disabled={blocked}
          aria-label="Enable Group by Pokédex"
        />
        <span>Group by Pokédex</span>
      </label>
      {!active && <p className="pokedex-projects__hint">Turning this on selects the National Pokédex.</p>}
      {hasUnsavedChanges && <div className="pokedex-projects__pending">
        <span>Unsaved Pokédex changes</span>
        <button type="button" onClick={updateProject} disabled={blocked}>Save changes</button>
      </div>}
      <details className="pokedex-projects__manage">
        <summary>Manage Pokédexes</summary>
        <div className="pokedex-projects__manage-content">
          <div className="pokedex-projects__actions">
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="New Pokédex name" aria-label="New Pokédex name" />
            <button type="button" onClick={createProject} disabled={blocked}>Save as new Pokédex</button>
          </div>
          <div className="pokedex-projects__actions">
            <button type="button" onClick={exportProjects} disabled={saved.projects.length === 0}>Export</button>
            {!blocked && <label className="pokedex-projects__import">Import <input type="file" accept="application/json,.json" onChange={importProjects} /></label>}
            {active && <button type="button" onClick={deleteProject} disabled={blocked}>Delete current Pokédex</button>}
          </div>
        </div>
      </details>
      {error && <p role="alert" className="auth-card__error">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
};
