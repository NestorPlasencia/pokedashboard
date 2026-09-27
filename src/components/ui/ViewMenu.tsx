import { useEffect, useRef, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useCardContext } from "../../context/CardContext";
import type { ViewOptions } from "../../types/dashboard";

const VIEWS = [
  { id: "cards", label: "Cards" },
  { id: "table", label: "Table" },
  { id: "trend", label: "Trend points" },
  { id: "binder", label: "Binder" },
] as const;

export const ViewMenu = () => {
  const { viewOptions, setViewOptions, pokemonGrouping } = useCardContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentView = viewOptions.displayMode.startsWith("trend") ? "trend"
    : viewOptions.displayMode.startsWith("table") ? "table"
      : viewOptions.displayMode.startsWith("binder") ? "binder" : "cards";

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectView = (mode: typeof VIEWS[number]["id"]) => {
    const displayMode = `${mode}${pokemonGrouping.enabled ? "Grouped" : "Ungrouped"}` as ViewOptions["displayMode"];
    setViewOptions((current) => ({ ...current, displayMode }));
    setOpen(false);
  };

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        type="button"
        className={`sort-menu__trigger${currentView !== "cards" ? " is-active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`View: ${VIEWS.find((view) => view.id === currentView)?.label}`}
        title={`View: ${VIEWS.find((view) => view.id === currentView)?.label}`}
      >
        <LayoutGrid size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="sort-menu__panel" role="menu" aria-label="View cards as">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              role="menuitemradio"
              aria-checked={currentView === view.id}
              className={`sort-menu__option${currentView === view.id ? " is-selected" : ""}`}
              onClick={() => selectView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
