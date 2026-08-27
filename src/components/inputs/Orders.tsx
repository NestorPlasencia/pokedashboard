import { useEffect, useState } from "react";
import { useCardContext } from "../../context/CardContext";
import { updateUrlParams, parseUrlParams } from "../../utils/urlParams";
import { CollapsibleFieldset } from "../ui/CollapsibleFieldset";

export const Orders = () => {
  const { viewOptions, setViewOptions, setSortConfig } = useCardContext();
  const orders = ["None", "Number", "Set and Number", "Pokedex", "Energy", "Rarities", "Energy and Name", "Energy and Pokedex", "Price ↑", "Price ↓"];
  const trendOrders = viewOptions.displayMode.includes('trend') ? ["Trend score ↑", "Trend score ↓"] : [];
  const [checkedOrder, setCheckedOrder] = useState<string>(() => {
    const params = parseUrlParams();
    return params.order || "None";
  });

  // Map order names to sortConfig
  const orderToSortConfig = (order: string) => {
    switch (order) {
      case "Number":
        return { field: 'number' as const, direction: 'asc' as const };
      case "Set and Number":
        return { field: 'setAndNumber' as const, direction: 'asc' as const };
      case "Pokedex":
        return { field: 'pokedex' as const, direction: 'asc' as const };
      case "Energy":
        return { field: 'energy' as const, direction: 'asc' as const };
      case "Rarities":
        return { field: 'rarity' as const, direction: 'asc' as const };
      case "Energy and Name":
        return { field: 'energyAndName' as const, direction: 'asc' as const };
      case "Energy and Pokedex":
        return { field: 'energyAndPokedex' as const, direction: 'asc' as const };
      case "Price ↑":
        return { field: 'price' as const, direction: 'asc' as const };
      case "Price ↓":
        return { field: 'price' as const, direction: 'desc' as const };
      case "Trend score ↑":
        return { field: 'buyTimingScore' as const, direction: 'asc' as const };
      case "Trend score ↓":
        return { field: 'buyTimingScore' as const, direction: 'desc' as const };
      default:
        return { field: 'number' as const, direction: 'asc' as const };
    }
  };

  // Aplicar el ordenamiento inicial desde la URL al montar
  useEffect(() => {
    setSortConfig(orderToSortConfig(checkedOrder));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo al montar

  // Actualizar sortConfig cuando checkedOrder cambia (por interacción del usuario)
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
