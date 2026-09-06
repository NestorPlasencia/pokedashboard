import { useSyncExternalStore } from 'react';
import { getOfflineSnapshot, subscribeToOfflineState } from '../services/offlineCache';

const subscribeToConnection = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/**
 * Whether the dashboard is currently running on saved data.
 *
 * `online` is the browser's own view of connectivity, which is a hint at best - a captive
 * portal reports "online". `servingStale` is the fact that matters: at least one load fell
 * back to a stored copy because the request actually failed.
 */
export const useOfflineStatus = () => {
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  const { staleKeys, oldestStoredAt } = useSyncExternalStore(
    subscribeToOfflineState,
    getOfflineSnapshot,
    getOfflineSnapshot
  );
  return { online, servingStale: staleKeys.length > 0, staleKeys, oldestStoredAt };
};
