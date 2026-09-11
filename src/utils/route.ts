import { rememberUrl } from '../services/launchUrl.ts';

/**
 * The app's pages, addressed by path.
 *
 * What a page shows still lives in the query string, and every page shares it: the catalog
 * stays mounted while Collections is open, so its filters, the armed collection and the
 * view mode belong to one state no matter which page wrote them last. Moving between pages
 * therefore changes the path and carries the query string along untouched.
 *
 * Deliberately free of React so the URL logic can be tested without a DOM.
 */
export type Route = 'catalog' | 'collections';

const PATHS: Record<Route, string> = {
  catalog: '/',
  collections: '/collections',
};

/** Anything unknown opens the catalog, so a mistyped link still loads. */
export const routeFromPath = (pathname: string): Route =>
  (pathname.replace(/\/+$/, '') || '/') === PATHS.collections ? 'collections' : 'catalog';

export const pathForRoute = (route: Route): string => PATHS[route];

export const currentRoute = (): Route => routeFromPath(window.location.pathname);

const listeners = new Set<() => void>();
/** The query string as last written, whichever history entry is showing. */
let liveSearch: string | null = null;

const notify = () => listeners.forEach((listener) => listener());

/** Called by the one place that writes the query string, so a page change can keep it. */
export const noteSearch = (search: string): void => {
  liveSearch = search;
};

/**
 * Back and forward restore the query string their history entry was created with, but the
 * state behind it has moved on since - arming a collection on the Collections page, say.
 * Reading the old one back would make the URL disagree with what is on screen, and the
 * next write would then build on the stale copy, so the latest query string is put back.
 */
const handlePopState = () => {
  if (liveSearch !== null && window.location.search !== liveSearch) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${liveSearch}`);
  }
  rememberUrl();
  notify();
};

export const subscribeToRoute = (listener: () => void): (() => void) => {
  if (listeners.size === 0) {
    liveSearch ??= window.location.search;
    window.addEventListener('popstate', handlePopState);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('popstate', handlePopState);
  };
};

/** A history entry per page change, so the back button returns to the previous page. */
export const navigate = (route: Route): void => {
  if (currentRoute() === route) return;
  window.history.pushState(null, '', `${pathForRoute(route)}${window.location.search}`);
  rememberUrl();
  notify();
};
