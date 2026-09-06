/**
 * Registers public/sw.js, which caches card images and the app shell.
 *
 * The worker runs in development too, but only for images. Caching the app shell there
 * would hand back yesterday's copy of a module the dev server just rewrote, which turns
 * HMR into a debugging session; card art is remote and immutable, so it has no such
 * problem and there is no reason to make it a production-only feature.
 *
 * The flag travels in the registration URL because that is what the worker can read back
 * from its own `location` - it needs to know before the first fetch it handles, which can
 * arrive before any message from the page.
 */
const workerUrl = `/sw.js?shell=${import.meta.env.PROD ? '1' : '0'}`;

export const registerServiceWorker = (): void => {
  if (!('serviceWorker' in navigator)) return;
  // Registering during load would compete with the first paint for bandwidth.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(workerUrl).catch(error => {
      // No worker means no offline images. The dashboard itself still works.
      console.warn('[cache] Service worker registration failed', error);
    });
  });
};

/**
 * Removes the worker. Paired with clearing the caches it owns, this is the "start over"
 * escape hatch for a worker that cached something broken.
 */
export const unregisterServiceWorker = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));
};
