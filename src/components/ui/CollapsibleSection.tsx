import React, { useEffect, useId, useState, ReactNode } from "react";
import { useCollapsibleGroup } from "./CollapsibleGroup";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  persistKey?: string;
  collapsedSummary?: ReactNode;
  onBeforeExpand?: () => boolean;
}

/**
 * A titled panel that folds away, showing a summary in its place.
 *
 * The whole header is the toggle - a disclosure button inside the heading - so the click
 * target is the panel's width rather than a 24px square, and screen readers get the state
 * from `aria-expanded` instead of having to interpret a "+" or "–".
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultCollapsed = false,
  persistKey,
  collapsedSummary,
  onBeforeExpand,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentId = useId();
  const group = useCollapsibleGroup();
  const report = group?.report;
  const forget = group?.forget;
  const commandNonce = group?.command?.nonce;
  const commandCollapsed = group?.command?.collapsed;

  // Keeps the group's control able to say whether "Collapse all" or "Expand all" is next.
  useEffect(() => { report?.(contentId, collapsed); }, [report, contentId, collapsed]);
  useEffect(() => () => forget?.(contentId), [forget, contentId]);

  // Obey a group command. Only the nonce belongs in the deps: this must fire once per
  // command, including when the same command is issued twice, and never merely because
  // the section re-rendered.
  useEffect(() => {
    if (commandNonce === undefined || commandCollapsed === undefined) return;
    setCollapsed(commandCollapsed);
    if (persistKey) {
      window.sessionStorage.setItem(`collapsed:${persistKey}`, String(commandCollapsed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandNonce]);

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
    if (collapsed && onBeforeExpand && !onBeforeExpand()) return;
    setCollapsed((prev) => {
      const nextValue = !prev;
      if (persistKey) {
        window.sessionStorage.setItem(`collapsed:${persistKey}`, String(nextValue));
      }
      return nextValue;
    });
  };

  return (
    <section className="collapsible-section">
      <h3 className="collapsible-section__header">
        <button
          type="button"
          className="collapsible-section__toggle"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          onClick={toggleCollapse}
        >
          <span className="collapsible-section__marker" aria-hidden="true">{collapsed ? '+' : '–'}</span>
          <span className="collapsible-section__title">{title}</span>
        </button>
      </h3>
      {/* Always rendered so `aria-controls` resolves; the children themselves are dropped
          while collapsed, and an empty box is hidden by CSS rather than by a second branch. */}
      <div className="collapsible-section__content" id={contentId}>
        {collapsed ? collapsedSummary : children}
      </div>
    </section>
  );
};
