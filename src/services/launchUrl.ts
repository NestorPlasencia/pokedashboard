/**
 * Brings an installed app back to where it was left.
 *
 * The whole state of the dashboard lives in the query string, and an installed PWA always
 * launches at the manifest's `start_url` - so closing and reopening it would otherwise
 * drop every filter, the sort, the view mode and the armed destinations. The manifest
 * cannot express "reopen where I was"; only remembering the last URL can.
 *
 * Deliberately limited to the installed app. In a browser tab, typing the bare address is
 * a request for a clean slate, and silently restoring yesterday's filters there would be
 * the opposite of what was asked.
 */
const KEY = 'pokedashboard.last-url.v1';

/** True when running from the home screen rather than inside browser chrome. */
const isInstalled = (): boolean => {
  try {
    // iOS predates display-mode and reports it on navigator instead.
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
    return ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay']
      .some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
  } catch {
    return false;
  }
};

let lastSaved: string | null = null;

/**
 * Records the current query string. Called from `updateUrlParams`, the one place that
 * writes the URL, so nothing can change the state without this seeing it.
 */
export const rememberUrl = (): void => {
  if (typeof window === 'undefined') return;
  const search = window.location.search;
  if (search === lastSaved) return;
  lastSaved = search;
  try {
    window.localStorage.setItem(KEY, search);
  } catch {
    // Storage full or blocked: the app still works, it just forgets where it was.
  }
};

/**
 * Restores the remembered query string, if this is an installed launch that arrived with
 * none of its own. Must run before the app reads the URL, and uses `replaceState` so the
 * restore does not become a history entry the back button lands on.
 */
export const restoreLaunchUrl = (): void => {
  if (typeof window === 'undefined') return;
  // A launch carrying parameters is a deliberate one - a shared link, a shortcut to a
  // particular view - and must win over whatever was saved.
  if (window.location.search || !isInstalled()) return;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (!saved || saved === '?') return;
    lastSaved = saved;
    window.history.replaceState(null, '', `${window.location.pathname}${saved}`);
  } catch {
    // Nothing to restore; the app opens on the catalog.
  }
};

/** Forgets the remembered URL, so the next installed launch starts clean. */
export const clearRememberedUrl = (): void => {
  lastSaved = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up.
  }
};
