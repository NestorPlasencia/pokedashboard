import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { normalizeSuggestedPriceSettings, readSuggestedPriceSettings, SUGGESTED_PRICE_STORAGE_KEY, type SuggestedPriceSettings } from "../utils/suggestedPrice";

interface SuggestedPricesValue {
  settings: SuggestedPriceSettings;
  setSettings: Dispatch<SetStateAction<SuggestedPriceSettings>>;
  persistenceError: boolean;
}

const SuggestedPricesContext = createContext<SuggestedPricesValue | undefined>(undefined);

export const SuggestedPricesProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState(() => {
    try { return readSuggestedPriceSettings(window.localStorage); }
    catch { return normalizeSuggestedPriceSettings(null); }
  });
  const [persistenceError, setPersistenceError] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(SUGGESTED_PRICE_STORAGE_KEY, JSON.stringify(settings));
      setPersistenceError(false);
    } catch {
      setPersistenceError(true);
    }
  }, [settings]);

  const value = useMemo(() => ({ settings, setSettings, persistenceError }), [settings, persistenceError]);
  return <SuggestedPricesContext.Provider value={value}>{children}</SuggestedPricesContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSuggestedPrices = () => {
  const value = useContext(SuggestedPricesContext);
  if (!value) throw new Error("useSuggestedPrices must be used inside SuggestedPricesProvider");
  return value;
};
