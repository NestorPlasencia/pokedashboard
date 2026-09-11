import type { MouseEvent } from "react";
import { LayoutGrid, Library, type LucideIcon } from "lucide-react";
import { useRoute } from "../../hooks/useRoute";
import { navigate, pathForRoute, type Route } from "../../utils/route";

const PAGES: { route: Route; label: string; Icon: LucideIcon }[] = [
  { route: "catalog", label: "Catalog", Icon: LayoutGrid },
  { route: "collections", label: "Collections", Icon: Library },
];

/**
 * Switches between the app's pages. Real links, so opening one in a new tab still works;
 * a plain click stays in the page instead of reloading it.
 */
export function AppNav() {
  const route = useRoute();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, target: Route) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    navigate(target);
  };

  return (
    <nav className="app-nav" aria-label="Pages">
      {PAGES.map(({ route: target, label, Icon }) => (
        <a
          key={target}
          href={pathForRoute(target)}
          className={`app-nav__link${route === target ? " is-active" : ""}`}
          aria-current={route === target ? "page" : undefined}
          onClick={(event) => handleClick(event, target)}
        >
          <Icon size={15} aria-hidden="true" />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
