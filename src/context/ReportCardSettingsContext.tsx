import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { normalizeReportCardSettings, readReportCardSettings, reportCardSettingsKey, type ReportCardSettings } from '../utils/reportCardSettings';

type Value = { settings: ReportCardSettings; setSettings: (settings: ReportCardSettings) => void; persistenceError: boolean };
const Context = createContext<Value | null>(null);
const read = (userId: string) => {
  try { return readReportCardSettings(userId, window.localStorage); }
  catch { return { addTarget: null }; }
};

export function ReportCardSettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const initial = useMemo(() => read(userId), [userId]);
  const [state, setState] = useState(() => ({ userId, settings: initial, persistenceError: false }));
  const settings = state.userId === userId ? state.settings : initial;
  const persistenceError = state.userId === userId && state.persistenceError;
  const setSettings = useCallback((value: ReportCardSettings) => {
    const next = normalizeReportCardSettings(value);
    let failed = false;
    try { window.localStorage.setItem(reportCardSettingsKey(userId), JSON.stringify(next)); }
    catch { failed = true; }
    setState({ userId, settings: next, persistenceError: failed });
  }, [userId]);

  // Reports opened in another tab should use the destination just chosen in Settings.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== reportCardSettingsKey(userId)) return;
      setState({ userId, settings: read(userId), persistenceError: false });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [userId]);

  const value = useMemo(() => ({ settings, setSettings, persistenceError }), [settings, setSettings, persistenceError]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReportCardSettings() {
  const value = useContext(Context);
  if (!value) throw new Error('ReportCardSettingsProvider is required');
  return value;
}
