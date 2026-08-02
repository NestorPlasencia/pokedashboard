import React, { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { OptionsCollection } from "../types/dashboard";

interface OptionsContextType {
  // Collections data (available collections from collector)
  collections: OptionsCollection[];
  setCollections: React.Dispatch<React.SetStateAction<OptionsCollection[]>>;
}

const OptionsContext = createContext<OptionsContextType | undefined>(undefined);

export const OptionsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [collections, setCollections] = useState<OptionsCollection[]>([]);

  const value = useMemo(() => ({
    collections,
    setCollections,
  }), [collections]);

  return (
    <OptionsContext.Provider
      value={value}
    >
      {children}
    </OptionsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useOptionsContext = () => {
  const context = useContext(OptionsContext);
  if (context === undefined) {
    throw new Error("useOptionsContext must be used within a OptionsProvider");
  }
  return context;
};
