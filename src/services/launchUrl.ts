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
 * Records the current page and query string. Called from `updateUrlParams`, the one place
 * that writes the query, and on every page change, so nothing can move without this seeing it.
 */
export const rememberUrl = (): void => {
  if (typeof window === 'undefined') return;
  // A shared `/c/<id>` link is someone else's collection, not where this user was
  // working - and the manifest's scope is `/`, so an installed app captures those links.
  // Remembering one would relaunch the app into a stranger's page. The prefix is repeated
  // from `route.ts` rather than imported: that module already imports this one.
  if (window.location.pathname.startsWith('/c/')) return;
  const url = `${window.location.pathname}${window.location.search}`;
  if (url === lastSaved) return;
  lastSaved = url;
  try {
    window.localStorage.setItem(KEY, url);
  } catch {
    // Storage full or blocked: the app still works, it just forgets where it was.
  }
};

/**
 * Restores the remembered page and query string, if this is an installed launch that
 * arrived at the start URL with nothing of its own. Must run before the app reads the URL,
 * and uses `replaceState` so the restore does not become a history entry the back button
 * lands on.
 */
export const restoreLaunchUrl = (): void => {
  if (typeof window === 'undefined') return;
  // A launch carrying parameters or a page of its own is a deliberate one - a shared link,
  // a shortcut to a particular view - and must win over whatever was saved.
  if (window.location.search || window.location.pathname !== '/' || !isInstalled()) return;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (!saved) return;
    // Older builds saved the query string alone, and it always belonged to the catalog.
    const url = saved.startsWith('?') ? `/${saved}` : saved;
    if (url === '/' || url === '/?') return;
    lastSaved = url;
    window.history.replaceState(null, '', url);
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
