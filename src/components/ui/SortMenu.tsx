import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, RotateCcw } from "lucide-react";
import { useCardContext } from "../../context/CardContext";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";
import { ORDER_OPTIONS, TREND_ORDER_OPTIONS, orderToSortConfig } from "../../utils/orders";

/**
 * How cards are ordered. A single choice doesn't need a whole collapsible panel taking
 * up sidebar space, so it lives behind one icon in the search row instead - open it,
 * pick an order, it closes.
 */
export const SortMenu = () => {
  const { viewOptions, setViewOptions, setSortConfig } = useCardContext();
  const orders = ORDER_OPTIONS;
  const trendOrders = viewOptions.displayMode.includes('trend') ? TREND_ORDER_OPTIONS : [];
  const allOrders = [...orders, ...trendOrders];
  // CardContext already turned this parameter into the initial sortConfig; the menu only
  // needs the name back so the right option starts marked as current.
  const [checkedOrder, setCheckedOrder] = useState<string>(() => parseUrlParams().order || "None");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep sortConfig in step with the selected option.
  useEffect(() => {
    setSortConfig(orderToSortConfig(checkedOrder));
  }, [checkedOrder, setSortConfig]);

  // A menu with no backdrop closes on its own terms: anywhere else, or Escape.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (order: string): void => {
    setCheckedOrder(order);
    if (order.startsWith('Trend score')) {
      setViewOptions(prev => ({
        ...prev,
        displayMode: prev.displayMode.includes('Grouped') ? 'trendGrouped' : 'trendUngrouped',
        trendSortDirection: order.endsWith('↑') ? 'asc' : 'desc',
      }));
    }
    updateUrlParams({ order });
    setOpen(false);
  };

  const handleReset = () => {
    setCheckedOrder("None");
    updateUrlParams({ order: 'None' });
    setOpen(false);
  };

  const isActive = checkedOrder !== "None";

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        type="button"
        className={`sort-menu__trigger${isActive ? " is-active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isActive ? `Sort cards: ${checkedOrder}` : "Sort cards"}
        title={isActive ? `Sort: ${checkedOrder}` : "Sort cards"}
      >
        <ArrowUpDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="sort-menu__panel" role="menu" aria-label="Sort cards">
          {allOrders.map((order) => (
            <button
              key={order}
              type="button"
              role="menuitemradio"
              aria-checked={checkedOrder === order}
              className={`sort-menu__option${checkedOrder === order ? " is-selected" : ""}`}
              onClick={() => handleSelect(order)}
            >
              {order}
            </button>
          ))}
          <button type="button" className="sort-menu__reset" onClick={handleReset}>
            <RotateCcw size={13} aria-hidden="true" /> Reset sort
          </button>
        </div>
      )}
    </div>
  );
};
