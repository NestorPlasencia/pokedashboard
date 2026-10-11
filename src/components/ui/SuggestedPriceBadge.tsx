import { useSuggestedPrices } from "../../context/SuggestedPricesContext";
import { calculateSuggestedPrice, formatSuggestedPrice } from "../../utils/suggestedPrice";

export const SuggestedPriceBadge = ({ marketPrice }: { marketPrice: number | null }) => {
  const { settings } = useSuggestedPrices();
  const target = settings.showOnCards ? calculateSuggestedPrice(marketPrice, settings) : null;
  if (!target) return null;
  const currency = formatSuggestedPrice(target.price);
  return <span className="suggested-price" title={`Precio sugerido de compra · ${target.percent}% menos que Near Mint. Configurable en Settings.`}>
    <strong>{currency}</strong>
    <small>−{target.percent}%</small>
  </span>;
};
