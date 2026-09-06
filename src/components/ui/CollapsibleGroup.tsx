import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

/** A broadcast to every section below. The nonce is what makes a repeat of the previous
 *  command still count as a new one. */
type GroupCommand = { collapsed: boolean; nonce: number };

type GroupValue = {
  command: GroupCommand | null;
  report: (id: string, collapsed: boolean) => void;
  forget: (id: string) => void;
  allCollapsed: boolean;
  setAll: (collapsed: boolean) => void;
};

const Context = createContext<GroupValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useCollapsibleGroup = () => useContext(Context);

/**
 * Lets one control fold or unfold every CollapsibleSection beneath it.
 *
 * The sections keep owning their own open state - the group only broadcasts a command and
 * tallies what the sections report back - so a section still works on its own outside a
 * group, and one opened by hand afterwards stays open.
 */
export function CollapsibleGroup({ children }: { children: ReactNode }) {
  const [command, setCommand] = useState<GroupCommand | null>(null);
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});

  // Both bail out when nothing changed, so the sections re-reporting an unchanged state
  // settles instead of looping.
  const report = useCallback((id: string, collapsed: boolean) => {
    setCollapsedById(prev => (prev[id] === collapsed ? prev : { ...prev, [id]: collapsed }));
  }, []);

  const forget = useCallback((id: string) => {
    setCollapsedById(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const value = useMemo<GroupValue>(() => {
    const states = Object.values(collapsedById);
    return {
      command,
      report,
      forget,
      // Nothing registered means nothing to unfold, so the control offers to collapse.
      allCollapsed: states.length > 0 && states.every(Boolean),
      setAll: (collapsed: boolean) => setCommand(prev => ({ collapsed, nonce: (prev?.nonce ?? 0) + 1 })),
    };
  }, [collapsedById, command, report, forget]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** One button that flips to "Expand all" once everything below it is folded away. */
export function CollapseAllButton({ className }: { className?: string }) {
  const group = useCollapsibleGroup();
  if (!group) return null;

  const collapse = !group.allCollapsed;
  const label = collapse ? 'Collapse all' : 'Expand all';
  const Icon = collapse ? ChevronsDownUp : ChevronsUpDown;
  return (
    <button type="button" className={className} onClick={() => group.setAll(collapse)} title={label}>
      <Icon size={13} aria-hidden="true" />
      {label}
    </button>
  );
}
