import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useCardContext } from "../../context/CardContext";
import { useOptionsContext } from "../../context/OptionsContext";
import type { Card, ConditionKey } from "../../types/dashboard";
import {
  CONDITION_KEYS,
  CONDITION_ABBR,
  getConditionOverrides,
  setConditionOverride,
  clearAllOverrides,
  buildExportEntries,
  downloadJSON,
  importConditionOverrides,
  type CardConditions,
  type ConditionOverrides,
} from "../../utils/conditionStorage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sum all condition values */
const sumConditions = (conds: CardConditions): number =>
  CONDITION_KEYS.reduce((s, k) => s + (conds[k] ?? 0), 0);

/** Get total quantity of a card in a specific collection (from card data) */
const getOriginalQty = (card: Card, collectionName: string): number => {
  const col = (card.collections ?? []).find((c) => c.name === collectionName);
  if (!col) return 0;
  if (typeof col.quantity === "number") return col.quantity as unknown as number;
  return Object.values(col.quantity).reduce((s, v) => s + (v ?? 0), 0);
};

/** Get original conditions (from generated card data) as CardConditions */
const getOriginalConditions = (card: Card, collectionName: string): CardConditions => {
  const col = (card.collections ?? []).find((c) => c.name === collectionName);
  if (!col) return {};
  if (typeof col.quantity === "number") return { "Near Mint": col.quantity as unknown as number };
  return { ...(col.quantity as CardConditions) };
};

// ─── Component ───────────────────────────────────────────────────────────────

export const ConditionEditor: React.FC = () => {
  const { allCards, sortedCards, collectionFilter } = useCardContext();
  const { collections } = useOptionsContext();

  // ─ UI state ─
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

  // ─ Overrides state (mirror of localStorage) ─
  const [overrides, setOverrides] = useState<ConditionOverrides>(getConditionOverrides);

  // ─ Bulk edit state ─
  const [bulkConditions, setBulkConditions] = useState<CardConditions>({});
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  // ─ Import ref ─
  const importInputRef = useRef<HTMLInputElement>(null);

  // Initialise collection: prefer the first selected collection from the dashboard's URL filter,
  // otherwise fall back to the first available collection in options.
  useEffect(() => {
    if (selectedCollection) return;
    if (collections.length === 0) return;
    const fromUrl = collectionFilter.selectedCollections?.[0];
    if (fromUrl && collections.some((c) => c.name === fromUrl)) {
      setSelectedCollection(fromUrl);
    } else {
      setSelectedCollection(collections[0].name);
    }
  }, [collections, selectedCollection, collectionFilter.selectedCollections]);

  // ─── Derived data ────────────────────────────────────────────────────────

  /** All cards that belong to the selected collection, respecting active series/set/order filters */
  const collectionCards = useMemo<Card[]>(() => {
    if (!selectedCollection) return [];
    const base = sortedCards.length > 0 ? sortedCards : allCards;
    return base.filter((c) =>
      (c.collections ?? []).some((col) => col.name === selectedCollection)
    );
  }, [allCards, sortedCards, selectedCollection]);

  /** Cards filtered by search text */
  const visibleCards = useMemo<Card[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return collectionCards;
    return collectionCards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.number?.toString().toLowerCase().includes(q) ||
        c.setName?.toLowerCase().includes(q) ||
        (c.setNames ?? []).some((setName) => setName.toLowerCase().includes(q))
    );
  }, [collectionCards, search]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleConditionChange = useCallback(
    (cardId: string, condKey: ConditionKey, raw: string) => {
      const requested = Math.max(0, parseInt(raw, 10) || 0);
      const card = allCards.find((c) => c.id === cardId) as Card;
      const originalTotal = getOriginalQty(card, selectedCollection);
      setOverrides((prev) => {
        const cardMap = { ...(prev[cardId] ?? {}) };
        const current = { ...(cardMap[selectedCollection] ?? getOriginalConditions(card, selectedCollection)) };

        // Cap to the total max
        const value = Math.min(requested, originalTotal);

        // If raising this value pushes others over the total → steal from others (left-to-right)
        const currentOthersSum = CONDITION_KEYS.filter((k) => k !== condKey)
          .reduce((s, k) => s + (current[k] ?? 0), 0);
        const excess = currentOthersSum + value - originalTotal;
        if (excess > 0) {
          let toFree = excess;
          for (const k of CONDITION_KEYS) {
            if (k === condKey || toFree <= 0) continue;
            const available = current[k] ?? 0;
            const reduce = Math.min(available, toFree);
            current[k] = available - reduce;
            toFree -= reduce;
          }
        }

        current[condKey] = value;

        // If lowering this value creates a deficit → redistribute remainder into first available other condition
        const newTotal = CONDITION_KEYS.reduce((s, k) => s + (current[k] ?? 0), 0);
        const deficit = originalTotal - newTotal;
        if (deficit > 0) {
          // Add deficit to the first other condition (prefer NM, skip current key)
          for (const k of CONDITION_KEYS) {
            if (k === condKey) continue;
            current[k] = (current[k] ?? 0) + deficit;
            break;
          }
        }

        cardMap[selectedCollection] = current;
        const next = { ...prev, [cardId]: cardMap };
        setConditionOverride(cardId, selectedCollection, current);
        return next;
      });
    },
    [allCards, selectedCollection]
  );

  const handleSelectCard = useCallback((cardId: string, checked: boolean) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      checked ? next.add(cardId) : next.delete(cardId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedCardIds.size === visibleCards.length) {
      setSelectedCardIds(new Set());
    } else {
      setSelectedCardIds(new Set(visibleCards.map((c) => c.id)));
    }
  }, [selectedCardIds, visibleCards]);

  const handleBulkConditionChange = useCallback(
    (condKey: ConditionKey, raw: string) => {
      const value = Math.max(0, parseInt(raw, 10) || 0);
      setBulkConditions((prev) => ({ ...prev, [condKey]: value }));
    },
    []
  );

  const handleBulkApply = useCallback(() => {
    if (selectedCardIds.size === 0) return;
    const rawConditions: CardConditions = {};
    CONDITION_KEYS.forEach((k) => {
      if ((bulkConditions[k] ?? 0) > 0) rawConditions[k] = bulkConditions[k];
    });
    const requestedTotal = sumConditions(rawConditions);
    setOverrides((prev) => {
      const next = { ...prev };
      selectedCardIds.forEach((cardId) => {
        const card = allCards.find((c) => c.id === cardId) as Card;
        const originalTotal = getOriginalQty(card, selectedCollection);
        // Scale down proportionally if bulk total exceeds this card's original qty
        const clamped: CardConditions = {};
        if (requestedTotal > 0 && originalTotal < requestedTotal) {
          CONDITION_KEYS.forEach((k) => {
            if ((rawConditions[k] ?? 0) > 0) {
              clamped[k] = Math.floor((rawConditions[k]! / requestedTotal) * originalTotal);
            }
          });
          // Give any remaining 1s to the first non-zero key
          const clampedTotal = sumConditions(clamped);
          const remainder = originalTotal - clampedTotal;
          if (remainder > 0) {
            const firstKey = CONDITION_KEYS.find((k) => (rawConditions[k] ?? 0) > 0);
            if (firstKey) clamped[firstKey] = (clamped[firstKey] ?? 0) + remainder;
          }
        } else {
          Object.assign(clamped, rawConditions);
        }
        const cardMap = { ...(next[cardId] ?? {}) };
        cardMap[selectedCollection] = clamped;
        next[cardId] = cardMap;
        setConditionOverride(cardId, selectedCollection, clamped);
      });
      return next;
    });
  }, [selectedCardIds, bulkConditions, selectedCollection, allCards]);

  const handleClearSelected = useCallback(() => {
    setOverrides((prev) => {
      const next = { ...prev };
      selectedCardIds.forEach((cardId) => {
        if (next[cardId]) {
          delete next[cardId][selectedCollection];
          if (Object.keys(next[cardId]).length === 0) delete next[cardId];
        }
        setConditionOverride(cardId, selectedCollection, {});
      });
      return next;
    });
    setSelectedCardIds(new Set());
  }, [selectedCardIds, selectedCollection]);

  const handleExport = useCallback(() => {
    const entries = buildExportEntries(allCards, [selectedCollection]);
    const json = JSON.stringify(entries, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    downloadJSON(json, `conditions-${selectedCollection.replace(/\s+/g, "_")}-${date}.json`);
  }, [allCards, selectedCollection]);

  const handleExportAll = useCallback(() => {
    const entries = buildExportEntries(allCards);
    const json = JSON.stringify(entries, null, 2);
    // Fixed name so the generate script picks it up from public/data/collector/conditions.json
    downloadJSON(json, "conditions.json");
  }, [allCards]);

  const handleImportClick = () => importInputRef.current?.click();

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const count = importConditionOverrides(ev.target!.result as string);
        setOverrides(getConditionOverrides());
        alert(`Importadas ${count} entradas correctamente.`);
      } catch {
        alert("Error al importar el archivo. Verifica que sea un JSON válido.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleClearAll = useCallback(() => {
    if (!confirm("¿Eliminar TODOS los overrides guardados en localStorage?")) return;
    clearAllOverrides();
    setOverrides({});
  }, []);

  // ─── Render helpers ──────────────────────────────────────────────────────

  const getEffectiveConditions = useCallback(
    (card: Card): CardConditions => {
      const override = overrides[card.id]?.[selectedCollection];
      if (override) return override;
      return getOriginalConditions(card, selectedCollection);
    },
    [overrides, selectedCollection]
  );

  const hasOverride = useCallback(
    (card: Card): boolean => !!overrides[card.id]?.[selectedCollection],
    [overrides, selectedCollection]
  );

  const overrideCount = useMemo(() => {
    return Object.keys(overrides).filter(
      (id) => overrides[id]?.[selectedCollection]
    ).length;
  }, [overrides, selectedCollection]);

  const allSelected =
    visibleCards.length > 0 && selectedCardIds.size === visibleCards.length;
  const someSelected = selectedCardIds.size > 0;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="condition-editor">
      {/* ── Toolbar ── */}
      <div className="condition-editor__toolbar">
        <span className="condition-editor__toolbar-title">
          Editor de Condiciones
        </span>

        <select
          className="condition-editor__collection-select"
          value={selectedCollection}
          onChange={(e) => {
            setSelectedCollection(e.target.value);
            setSelectedCardIds(new Set());
          }}
        >
          {collections.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <input
          className="condition-editor__search"
          type="text"
          placeholder="Buscar carta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          className="condition-editor__btn"
          onClick={() => {
            setShowBulkPanel((p) => !p);
            setBulkConditions({});
          }}
          disabled={!someSelected}
          title="Editar condiciones en masa para las cartas seleccionadas"
        >
          Editar selección ({selectedCardIds.size})
        </button>

        <button
          className="condition-editor__btn condition-editor__btn--success"
          onClick={handleExport}
          title={`Exportar overrides de la colección "${selectedCollection}" como JSON`}
        >
          Exportar colección
        </button>

        <button
          className="condition-editor__btn condition-editor__btn--success"
          onClick={handleExportAll}
          title="Exportar todos los overrides de todas las colecciones"
        >
          Exportar todo
        </button>

        <button
          className="condition-editor__btn"
          onClick={handleImportClick}
          title="Importar un archivo de condiciones previamente exportado"
        >
          Importar
        </button>
        <input
          ref={importInputRef}
          className="condition-editor__import-input"
          type="file"
          accept=".json"
          onChange={handleImportFile}
        />

        <button
          className="condition-editor__btn condition-editor__btn--danger"
          onClick={handleClearAll}
          title="Eliminar todos los overrides guardados"
        >
          Limpiar todo
        </button>

        <span className="condition-editor__count">
          {visibleCards.length} cartas
          {overrideCount > 0 && (
            <> · <strong>{overrideCount}</strong> con override</>
          )}
          {search && ` · filtradas de ${collectionCards.length}`}
        </span>
      </div>

      {/* ── Bulk Edit Panel ── */}
      {showBulkPanel && someSelected && (
        <div className="condition-editor__bulk-panel">
          <span className="condition-editor__bulk-label">
            Edición masiva ({selectedCardIds.size} cartas):
          </span>
          <div className="condition-editor__bulk-inputs">
            {CONDITION_KEYS.map((key) => (
              <div key={key} className="condition-editor__bulk-input-group">
                <label htmlFor={`bulk-${key}`}>{CONDITION_ABBR[key]}:</label>
                <input
                  id={`bulk-${key}`}
                  type="number"
                  min={0}
                  value={bulkConditions[key] ?? ""}
                  placeholder="0"
                  onChange={(e) => handleBulkConditionChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          <button
            className="condition-editor__btn condition-editor__btn--primary"
            onClick={handleBulkApply}
          >
            Aplicar
          </button>
          <button
            className="condition-editor__btn condition-editor__btn--danger"
            onClick={handleClearSelected}
            title="Eliminar los overrides de las cartas seleccionadas"
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="condition-editor__table-wrapper">
        {visibleCards.length === 0 ? (
          <div className="condition-editor__empty">
            {collectionCards.length === 0
              ? `No hay cartas en la colección "${selectedCollection}"`
              : "No se encontraron cartas con esa búsqueda"}
          </div>
        ) : (
          <table className="condition-editor__table">
            <thead>
              <tr>
                <th className="condition-editor__col-select">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          someSelected && !allSelected;
                    }}
                    onChange={handleSelectAll}
                    title="Seleccionar / deseleccionar todas"
                  />
                </th>
                <th className="condition-editor__col-image">Img</th>
                <th className="col-card-name">Carta</th>
                <th className="condition-editor__col-number">Nro.</th>
                <th>Set</th>
                <th>Serie</th>
                <th>Variante</th>
                <th className="condition-editor__col-center condition-editor__col-qty">Orig.</th>
                {CONDITION_KEYS.map((k) => (
                  <th
                    key={k}
                    className="condition-editor__col-center condition-editor__col-qty"
                    title={k}
                  >
                    {CONDITION_ABBR[k]}
                  </th>
                ))}
                <th className="condition-editor__col-center condition-editor__col-qty">Total</th>
              </tr>
            </thead>
            <tbody>
              {visibleCards.map((card) => {
                const isSelected = selectedCardIds.has(card.id);
                const effective = getEffectiveConditions(card);
                const originalQty = getOriginalQty(card, selectedCollection);
                const editedTotal = sumConditions(effective);
                const modified = hasOverride(card);

                return (
                  <tr
                    key={card.id}
                    className={[
                      isSelected ? "selected" : "",
                      modified ? "has-overrides" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {/* Checkbox */}
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) =>
                          handleSelectCard(card.id, e.target.checked)
                        }
                      />
                    </td>

                    {/* Thumbnail */}
                    <td>
                      {card.image ? (
                        <img
                          src={card.image}
                          alt={card.name}
                          className="condition-editor__thumb"
                          loading="lazy"
                        />
                      ) : (
                        <span className="condition-editor__thumb-empty">—</span>
                      )}
                    </td>

                    {/* Name */}
                    <td className="col-card-name">{card.name}</td>

                    {/* Number */}
                    <td className="condition-editor__col-center">{card.number}</td>

                    {/* Set */}
                    <td>{card.setName}</td>

                    {/* Serie */}
                    <td>{card.setSeries}</td>

                    {/* Variante */}
                    <td>{card.variant || "Normal"}</td>

                    {/* Original qty */}
                    <td
                      className="condition-editor__col-center cond-total--original"
                      title="Cantidad original en la colección"
                    >
                      {originalQty}
                    </td>

                    {/* Per-condition inputs */}
                    {CONDITION_KEYS.map((condKey) => {
                      const val = effective[condKey] ?? 0;
                      const isModified =
                        modified &&
                        (effective[condKey] ?? 0) !== (getOriginalConditions(card, selectedCollection)[condKey] ?? 0);
                      return (
                        <td key={condKey} className="condition-editor__col-center">
                          <input
                            className={`condition-editor__cond-input${isModified ? " modified" : ""}`}
                            type="number"
                            min={0}
                            value={val === 0 ? "" : val}
                            placeholder="0"
                            onChange={(e) =>
                              handleConditionChange(card.id, condKey, e.target.value)
                            }
                          />
                        </td>
                      );
                    })}

                    {/* Edited total */}
                    <td
                      className={
                        modified
                          ? "condition-editor__col-center cond-total--edited"
                          : "condition-editor__col-center cond-total--original"
                      }
                    >
                      {editedTotal}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
