import { useState } from "react";
import { useSuggestedPrices } from "../../context/SuggestedPricesContext";
import { calculateSuggestedPrice, DEFAULT_SUGGESTED_PRICE_SETTINGS, formatSuggestedPrice, normalizeSuggestedPriceSettings, SUGGESTED_PRICE_TIERS, type SuggestedPriceSettings as Settings } from "../../utils/suggestedPrice";
import { CollapsibleSection } from "../ui/CollapsibleSection";

const tiers = SUGGESTED_PRICE_TIERS;
const currency = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const SuggestedPriceSettings = () => {
  const { settings, setSettings, persistenceError } = useSuggestedPrices();
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);
  const edit = (update: (current: Settings) => Settings) => { setDraft(update); setSaved(false); };
  const valid = Number.isFinite(draft.minimumDiscountPercent) && draft.minimumDiscountPercent >= 0 && draft.minimumDiscountPercent <= 95 &&
    tiers.every(({ id }) => Number.isFinite(draft.tiers[id].maximumDiscountPercent) && draft.tiers[id].maximumDiscountPercent >= draft.minimumDiscountPercent && draft.tiers[id].maximumDiscountPercent <= 95 && Number.isFinite(draft.tiers[id].roundingStep) && draft.tiers[id].roundingStep >= 0.01 && draft.tiers[id].roundingStep <= 1000);

  return <div className="section-sidebar">
    <CollapsibleSection title="Precios sugeridos" defaultCollapsed={false}>
      <form className="suggested-price-settings" onSubmit={event => { event.preventDefault(); if (valid) { setSettings(normalizeSuggestedPriceSettings(draft)); setSaved(true); } }}>
        <p>Precio objetivo de compra basado en el precio Near Mint. Usa la misma regla en las cartas y al imprimir una wishlist.</p>
        <label className="view-options-checkbox"><input type="checkbox" checked={draft.showOnCards} onChange={event => edit(current => ({ ...current, showOnCards: event.target.checked }))} />Mostrar en la vista de cartas y tendencias</label>
        <label className="view-options-checkbox"><input type="checkbox" checked={draft.showInWishlistPrint} onChange={event => edit(current => ({ ...current, showInWishlistPrint: event.target.checked }))} />Incluir al imprimir una wishlist</label>
        <label className="suggested-price-settings__minimum">Descuento mínimo (%)<input type="number" required min="0" max="95" step="0.1" value={Number.isNaN(draft.minimumDiscountPercent) ? "" : draft.minimumDiscountPercent} onChange={event => edit(current => ({ ...current, minimumDiscountPercent: event.target.valueAsNumber }))} /></label>
        <div className="suggested-price-settings__tiers">
          {tiers.map(({ id, label, example }) => {
            const target = valid ? calculateSuggestedPrice(example, draft) : null;
            return <fieldset key={id}>
              <legend>{label}</legend>
              <label>Descuento máximo deseado (%)<input type="number" required min={Number.isFinite(draft.minimumDiscountPercent) ? draft.minimumDiscountPercent : 0} max="95" step="0.1" value={Number.isNaN(draft.tiers[id].maximumDiscountPercent) ? "" : draft.tiers[id].maximumDiscountPercent} onChange={event => edit(current => ({ ...current, tiers: { ...current.tiers, [id]: { ...current.tiers[id], maximumDiscountPercent: event.target.valueAsNumber } } }))} /></label>
              <label>Redondear a múltiplos de ($)<input type="number" required min="0.01" max="1000" step="0.01" value={Number.isNaN(draft.tiers[id].roundingStep) ? "" : draft.tiers[id].roundingStep} onChange={event => edit(current => ({ ...current, tiers: { ...current.tiers, [id]: { ...current.tiers[id], roundingStep: event.target.valueAsNumber } } }))} /></label>
              <small>Ejemplo: {currency(example)} → {target ? `${formatSuggestedPrice(target.price)} (−${target.percent}%)` : "—"}</small>
            </fieldset>;
          })}
        </div>
        <p className="suggested-price-settings__hint">Prioriza cifras redondas: $1, $5 y $10 por defecto. Si no cabe un múltiplo en el rango, usa el inferior; el descuento puede superar el máximo deseado. Si no hay un múltiplo positivo con el descuento mínimo, no muestra precio sugerido. Solo usa centavos si eliges un múltiplo decimal. Se guarda en este navegador.</p>
        {!valid && <p role="alert">El máximo debe ser mayor o igual al mínimo (0–95%). El múltiplo debe estar entre $0.01 y $1,000.</p>}
        <div className="suggested-price-settings__actions">
          <button type="submit" disabled={!valid}>Guardar precios sugeridos</button>
          <button type="button" onClick={() => { const defaults = normalizeSuggestedPriceSettings(DEFAULT_SUGGESTED_PRICE_SETTINGS); setDraft(defaults); setSettings(defaults); setSaved(true); }}>Restablecer valores</button>
          <span role="status">{persistenceError ? "No se pudo guardar en este navegador." : saved ? "Configuración guardada." : ""}</span>
        </div>
      </form>
    </CollapsibleSection>
  </div>;
};
