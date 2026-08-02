import React, { useEffect, useState, ReactNode } from "react";

interface CollapsibleFieldsetProps {
  legend: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  persistKey?: string;
  collapsedSummary?: ReactNode;
}

export const CollapsibleFieldset: React.FC<CollapsibleFieldsetProps> = ({
  legend,
  children,
  defaultCollapsed = false,
  persistKey,
  collapsedSummary
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!persistKey) return;

    const stored = window.sessionStorage.getItem(`collapsed:${persistKey}`);
    if (stored === 'true') {
      setCollapsed(true);
    }
    if (stored === 'false') {
      setCollapsed(false);
    }
  }, [persistKey]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const nextValue = !prev;
      if (persistKey) {
        window.sessionStorage.setItem(`collapsed:${persistKey}`, String(nextValue));
      }
      return nextValue;
    });
  };

  return (
    <fieldset className="collapsible-fieldset">
      <legend className="collapsible-legend">
        <button
          type="button"
          aria-label={collapsed ? `Expand ${legend}` : `Collapse ${legend}`}
          onClick={toggleCollapse}
          className="collapsible-legend-button"
        >
          {collapsed ? '+' : '–'}
        </button>
        {legend}
      </legend>
      {!collapsed && (
        <div className="collapsible-fieldset-content">
          {children}
        </div>
      )}
      {collapsed && collapsedSummary && (
        <div className="collapsible-fieldset-content">
          {collapsedSummary}
        </div>
      )}
    </fieldset>
  );
};
