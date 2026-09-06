import { useEffect, useState } from "react";
import { useCardContext } from "../../context/CardContext";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";
import { ORDER_OPTIONS, TREND_ORDER_OPTIONS, orderToSortConfig } from "../../utils/orders";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";

export const Orders = () => {
  const { viewOptions, setViewOptions, setSortConfig } = useCardContext();
  const orders = ORDER_OPTIONS;
  const trendOrders = viewOptions.displayMode.includes('trend') ? TREND_ORDER_OPTIONS : [];
  // CardContext already turned this parameter into the initial sortConfig; the radio
  // group only needs the name back so the right option starts checked.
  const [checkedOrder, setCheckedOrder] = useState<string>(() => parseUrlParams().order || "None");

  // Keep sortConfig in step with the selected option.
  useEffect(() => {
    setSortConfig(orderToSortConfig(checkedOrder));
  }, [checkedOrder, setSortConfig]);

  const handleCheckboxChange = (order: string): void => {
    setCheckedOrder(order);
    if (order.startsWith('Trend score')) {
      setViewOptions(prev => ({ ...prev, displayMode: prev.displayMode.includes('Grouped') ? 'trendGrouped' : 'trendUngrouped', trendSortDirection: order.endsWith('↑') ? 'asc' : 'desc' }));
    }
    updateUrlParams({ order });
  };

  const handleResetOrder = () => {
    setCheckedOrder("None");
    updateUrlParams({ order: 'None' });
  };

  return (
    <div className="section-sidebar">
      <CollapsibleFieldset legend="Sort cards" defaultCollapsed={true}>
        {[...orders, ...trendOrders].map((order) => (
          <label key={order} className="orders-option-label">
            <input
              type="radio"
              value={order}
              checked={checkedOrder == order}
              onChange={() => handleCheckboxChange(order)}
              aria-label={`Sort by ${order}`}
            />
            {order}
          </label>
        ))}
        <button onClick={handleResetOrder} type="button" className="orders-reset-btn">
          Reset sort
        </button>
      </CollapsibleFieldset>
    </div>
  );
};
