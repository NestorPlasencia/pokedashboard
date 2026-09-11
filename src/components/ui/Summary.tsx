import { useMemo, type ClipboardEvent, type CSSProperties } from "react";
import { useCardContext } from "../../context/CardContext";
import type { Card } from "../../types/dashboard";
import { calculatePriceSummary } from "../../utils/utils";
import { shouldIncludePokemonForm } from "../../utils/filters";
import { POKEDEX_REGIONS } from "../../constants/constants";
import { useOptionsContext } from "../../context/OptionsContext";
import { activeFilterCollectionNames, quantityCollectionNames } from "../../utils/collectionQuantity";

interface RegionPokemonStats {
  regionName: string;
  // Pokemon (unique pokemon numbers)
  pokemonTotal: number;
  pokemonAvailable: number;
  pokemonOwned: number;
  // Pokemon Forms
  formsTotal: number;
  formsAvailable: number;
  formsOwned: number;
}

interface SetProgressThreshold {
  threshold: number;
  owned: number;
  required: number;
  percent: number;
}

interface SetProgressRow {
  setName: string;
  setLogo?: string;
  totalCards: number;
  thresholds: SetProgressThreshold[];
}

export const Summary = () => {
  const { 
    filteredCards, 
    variantsFilter, 
    conditionsFilter, 
    collectionFilteredCards, 
    pokemonGrouping, 
    collectionFilter,
    pokemonFormsData,
    sets,
    viewMode
  } = useCardContext();
  const { collections } = useOptionsContext();

  const summaryCollectionNames = useMemo(
    () => viewMode.kind === "collection"
      ? quantityCollectionNames(viewMode, collections, [])
      : activeFilterCollectionNames(collectionFilter.selectedCollections),
    [viewMode, collections, collectionFilter.selectedCollections]
  );
  const hasCollectionScope = summaryCollectionNames.length > 0;
  // Viewing a collection scopes the card list, but ownership and missing-card metrics
  // appear only after the user marks one or more collections in the filter.
  const ownershipCollectionNames = useMemo(
    () => activeFilterCollectionNames(collectionFilter.selectedCollections),
    [collectionFilter.selectedCollections]
  );
  const showsOwnership = ownershipCollectionNames.length > 0;

  // Memoize price summary calculation
  const summary = useMemo(() => {
    return calculatePriceSummary(
      filteredCards, 
      variantsFilter,
      hasCollectionScope,
      summaryCollectionNames,
      collectionFilter.limit,
      variantsFilter,
      hasCollectionScope ? collectionFilter.conditionsFilter : conditionsFilter
    );
  }, [
    filteredCards,
    variantsFilter,
    conditionsFilter,
    collectionFilter.conditionsFilter,
    collectionFilter.limit,
    summaryCollectionNames,
    hasCollectionScope,
  ]);

  const ownershipSummary = useMemo(() => calculatePriceSummary(
    filteredCards,
    variantsFilter,
    showsOwnership,
    ownershipCollectionNames,
    collectionFilter.limit,
    variantsFilter,
    ["All"]
  ), [
    filteredCards,
    variantsFilter,
    showsOwnership,
    ownershipCollectionNames,
    collectionFilter.limit,
  ]);

  const setProgress = useMemo(() => {
    const limit = Math.max(1, collectionFilter.limit || 1);
    const selectedCollections = ownershipCollectionNames;
    // Ownership is measured against the collections chosen in the filter. With the filter
    // off or nothing chosen every card counts as unowned, so the columns would only ever
    // read 0% - the table keeps its set totals and leaves them out.
    const tracksOwnership = selectedCollections.length > 0;
    const thresholds = tracksOwnership ? Array.from({ length: limit }, (_, index) => index + 1) : [];
    const setLogoByName = new Map(
      sets.map((set) => [set.name, set.images?.symbol || set.symbolImage || ""])
    );

    const getOwnedQuantity = (card: Card) => {
      if (selectedCollections.length === 0) return 0;

      return (card.collections || [])
        .filter((collection) => selectedCollections.includes(collection.name))
        .reduce((collectionSum, collection) => {
          const quantity = collection.quantity || {};
          // Progress belongs to the ownership selection, not the collection view condition.
          // Every active copy, including one with an unknown condition, counts here.
          const conditionSum = Object.values(quantity).reduce((sum, value) => sum + (value || 0), 0);
          return collectionSum + conditionSum;
        }, 0);
    };

    const grouped = new Map<string, Card[]>();
    filteredCards.forEach((card) => {
      const setName = card.setName || card.setNames?.[0] || "No set";
      const cards = grouped.get(setName) || [];
      cards.push(card);
      grouped.set(setName, cards);
    });

    const rows: SetProgressRow[] = Array.from(grouped.entries()).map(([setName, cards]) => {
      const ownedQuantities = cards.map(getOwnedQuantity);
      return {
        setName,
        setLogo: setLogoByName.get(setName),
        totalCards: cards.length,
        thresholds: thresholds.map((threshold) => {
          const required = cards.length;
          const owned = ownedQuantities.filter((quantity) => quantity >= threshold).length;
          return {
            threshold,
            owned,
            required,
            percent: required > 0 ? (owned / required) * 100 : 0
          };
        })
      };
    });

    const totalCards = rows.reduce((sum, row) => sum + row.totalCards, 0);
    const totalRow: SetProgressRow | null = rows.length > 1
      ? {
        setName: "Total",
        totalCards,
        thresholds: thresholds.map((threshold) => {
          const required = totalCards;
          const owned = rows.reduce(
            (sum, row) => sum + (row.thresholds.find((item) => item.threshold === threshold)?.owned || 0),
            0
          );
          return {
            threshold,
            owned,
            required,
            percent: required > 0 ? (owned / required) * 100 : 0
          };
        })
      }
      : null;

    return { rows, totalRow, thresholds };
  }, [
    filteredCards,
    collectionFilter.limit,
    sets,
    ownershipCollectionNames
  ]);

  // Memoize Pokemon + Pokemon Forms statistics per region
  const pokemonStats = useMemo(() => {
    if (!pokemonGrouping.enabled || filteredCards.length === 0) {
      return null;
    }

    const cardsForStats = showsOwnership ? collectionFilteredCards : filteredCards;

    // Determine which forms to include based on current filter settings
    let filteredForms = pokemonFormsData;
    if (pokemonGrouping.groupingRegions.length > 0 && !pokemonGrouping.groupingRegions.includes('All')) {
      filteredForms = pokemonFormsData.filter(form =>
        form.regions.some(r => pokemonGrouping.groupingRegions.includes(r.region.name))
      );
    }
    const formsToShow = filteredForms.filter(form =>
      shouldIncludePokemonForm(form, pokemonGrouping.allowVariants, pokemonGrouping.hideVariants)
    );

    // Build a set of form names that have cards / owned cards
    const formNamesWithCards = new Set<string>();
    const formNamesOwned = new Set<string>();
    cardsForStats.forEach(card => {
      if (card.pokemonForms) {
        if (!card.shadow) {
          card.pokemonForms.forEach(name => {
            formNamesWithCards.add(name);
            // Check if owned
            if (ownershipCollectionNames.length > 0) {
              const owned = (card.collections || [])
                .filter(c => ownershipCollectionNames.includes(c.name))
                .reduce((sum, c) => {
                  const qty = c.quantity || {};
                  return sum + Object.values(qty).reduce((s, v) => s + (v || 0), 0);
                }, 0);
              if (owned > 0) formNamesOwned.add(name);
            }
          });
        } else {
          // Shadow cards still count as "available"
          card.pokemonForms.forEach(name => formNamesWithCards.add(name));
        }
      }
    });

    // Get unique pokemon numbers with cards / owned
    const pokemonNumbersWithCards = new Set<number>();
    const pokemonNumbersOwned = new Set<number>();
    cardsForStats.forEach(card => {
      if (card.nationalPokedexNumbers) {
        if (!card.shadow) {
          card.nationalPokedexNumbers.forEach(num => {
            pokemonNumbersWithCards.add(num);
            if (ownershipCollectionNames.length > 0) {
              const owned = (card.collections || [])
                .filter(c => ownershipCollectionNames.includes(c.name))
                .reduce((sum, c) => {
                  const qty = c.quantity || {};
                  return sum + Object.values(qty).reduce((s, v) => s + (v || 0), 0);
                }, 0);
              if (owned > 0) pokemonNumbersOwned.add(num);
            }
          });
        } else {
          card.nationalPokedexNumbers.forEach(num => pokemonNumbersWithCards.add(num));
        }
      }
    });

    // Determine which regions to show
    const selectedRegions = pokemonGrouping.groupingRegions.includes('All')
      ? POKEDEX_REGIONS
      : POKEDEX_REGIONS.filter(r => pokemonGrouping.groupingRegions.includes(r.name));

    // Calculate global stats
    const globalFormsTotal = formsToShow.length;
    const globalFormsAvailable = formsToShow.filter(f => formNamesWithCards.has(f.name)).length;
    const globalFormsOwned = formsToShow.filter(f => formNamesOwned.has(f.name)).length;

    // Pokemon totals: unique pokemon numbers in selected regions
    let globalPokemonTotal = 0;
    selectedRegions.forEach(r => { globalPokemonTotal += r.count; });
    const globalPokemonAvailable = pokemonNumbersWithCards.size;
    const globalPokemonOwned = pokemonNumbersOwned.size;

    // Per-region stats
    const regionStats: RegionPokemonStats[] = selectedRegions.map(region => {
      // Pokemon in this region by pokedex number range
      const regionPokemonNumbers = new Set<number>();
      for (let i = region.start; i <= region.end; i++) {
        regionPokemonNumbers.add(i);
      }

      const pokemonTotal = region.count;
      let pokemonAvailable = 0;
      let pokemonOwned = 0;
      regionPokemonNumbers.forEach(num => {
        if (pokemonNumbersWithCards.has(num)) pokemonAvailable++;
        if (pokemonNumbersOwned.has(num)) pokemonOwned++;
      });

      // Forms in this region
      const regionForms = formsToShow.filter(f => {
        return f.regions.some(r => r.region.name === region.name);
      });
      const formsTotal = regionForms.length;
      const formsAvailable = regionForms.filter(f => formNamesWithCards.has(f.name)).length;
      const formsOwned = regionForms.filter(f => formNamesOwned.has(f.name)).length;

      return {
        regionName: region.name,
        pokemonTotal,
        pokemonAvailable,
        pokemonOwned,
        formsTotal,
        formsAvailable,
        formsOwned,
      };
    });

    return {
      global: {
        pokemonTotal: globalPokemonTotal,
        pokemonAvailable: globalPokemonAvailable,
        pokemonOwned: globalPokemonOwned,
        formsTotal: globalFormsTotal,
        formsAvailable: globalFormsAvailable,
        formsOwned: globalFormsOwned,
      },
      regions: regionStats,
    };
  }, [
    pokemonGrouping.enabled,
    pokemonGrouping.groupingRegions,
    pokemonGrouping.allowVariants,
    pokemonGrouping.hideVariants,
    filteredCards,
    collectionFilteredCards,
    showsOwnership,
    ownershipCollectionNames,
    pokemonFormsData
  ]);

  // Price formatter function
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(price);
  };

  const getProgressCellStyle = (percent: number) => {
    const normalized = Math.max(0, Math.min(100, percent));
    const hue = Math.round((normalized / 100) * 130);
    return {
      "--set-progress-hue": hue
    } as CSSProperties;
  };

  const handleSetProgressCopy = (event: ClipboardEvent<HTMLTableElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rows = Array.from(event.currentTarget.rows)
      .map((row) => Array.from(row.cells).filter((cell) => range.intersectsNode(cell)))
      .filter((cells) => cells.length > 0);

    if (rows.length === 0) return;

    const tabSeparatedValues = rows
      .map((cells) => cells
        .map((cell) => cell.dataset.copyValue ?? cell.textContent?.trim() ?? "")
        .join("\t"))
      .join("\r\n");

    event.preventDefault();
    event.clipboardData.setData("text/plain", tabSeparatedValues);
  };

  return (
    <div className="summary-content">
      {/* Global Information */}
      <table className="summary-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Cards</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>📋 Cards in search</td>
            <td><strong>{summary.isCollectionView ? summary.totalCopies : summary.totalCards}</strong></td>
            <td><strong>{formatPrice(summary.total)}</strong></td>
          </tr>
          {showsOwnership && collectionFilter.limit > 1 && (
            <tr className="secondary-row">
              <td>📋 Cards in search ({collectionFilter.limit})</td>
              <td><strong>{ownershipSummary.totalCardsToLimit}</strong></td>
              <td><strong>{formatPrice(ownershipSummary.totalToLimitPrice)}</strong></td>
            </tr>
          )}
          {summary.withoutPriceCount > 0 && (
            <tr className="secondary-row">
              <td>⚠️ No price</td>
              <td>{summary.withoutPriceCount}</td>
              <td>—</td>
            </tr>
          )}
          
          {summary.total > 0 && (
            <>
            </>
          )}
        </tbody>
      </table>

      {/* Collection Information */}
      {showsOwnership && (
        <table className="summary-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Cards</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>✅ Cards owned</td>
              <td><strong>{ownershipSummary.ownedCards}</strong></td>
              <td><strong>{formatPrice(ownershipSummary.ownedPrice)}</strong></td>
            </tr>
            {collectionFilter.limit > 1 && (
              <tr className="secondary-row">
                <td>✅ Cards owned ({collectionFilter.limit})</td>
                <td><strong>{ownershipSummary.ownedToLimit}</strong></td>
                <td><strong>{formatPrice(ownershipSummary.ownedToLimitPriceTotal)}</strong></td>
              </tr>
            )}
            <tr>
              <td>❌ Missing cards</td>
              <td><strong>{ownershipSummary.missingCards}</strong></td>
              <td><strong>{formatPrice(ownershipSummary.missingPrice)}</strong></td>
            </tr>
            <tr className="secondary-row">
              <td>❌ Missing cards ({collectionFilter.limit})</td>
              <td><strong>{ownershipSummary.missingToLimit}</strong></td>
              <td><strong>{formatPrice(ownershipSummary.missingToLimitPriceTotal)}</strong></td>
            </tr>
            

          </tbody>
        </table>
      )}

      {/* Pokémon + Forms Statistics */}
      {setProgress.rows.length > 0 && (
        <div className="set-progress-report">
          <h4>Progress by set</h4>
          <div className="set-progress-table-wrap">
            <table className="summary-table set-progress-table" onCopy={handleSetProgressCopy}>
              <thead>
                <tr>
                  <th data-copy-value="Set">Set</th>
                  <th data-copy-value="Total">Total</th>
                  {/* "Owned" alone when one copy counts; with a higher quantity required,
                      one column per number of copies. */}
                  {setProgress.thresholds.map((threshold) => {
                    const label = setProgress.thresholds.length === 1 ? "Owned" : `Owned ×${threshold}`;
                    return (
                      <th key={threshold} data-copy-value={label} title={`Cards with at least ${threshold} ${threshold === 1 ? "copy" : "copies"} in the selected collections`}>
                        {label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {setProgress.rows.map((row) => (
                  <tr key={row.setName}>
                    <td className="set-progress-name" title={row.setName} data-copy-value={row.setName}>
                      <span className="set-progress-name__content">
                        {row.setLogo && (
                          <img
                            className="set-progress-name__logo"
                            src={row.setLogo}
                            alt=""
                            loading="lazy"
                            onError={(event) => event.currentTarget.classList.add('is-hidden')}
                          />
                        )}
                        <span className="set-progress-name__label">{row.setName}</span>
                      </span>
                    </td>
                    <td data-copy-value={String(row.totalCards)}>{row.totalCards}</td>
                    {row.thresholds.map((item) => (
                      <td
                        key={item.threshold}
                        className="set-progress-cell"
                        style={getProgressCellStyle(item.percent)}
                        data-copy-value={`${item.percent.toFixed(2)}%`}
                      >
                        {item.percent.toFixed(2)}%
                        <span className="set-progress-tooltip">
                          {item.owned} owned
                          <br />
                          {Math.max(0, item.required - item.owned)} missing
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
                {setProgress.totalRow && (
                  <tr className="set-progress-total-row">
                    <td className="set-progress-name" data-copy-value={setProgress.totalRow.setName}>{setProgress.totalRow.setName}</td>
                    <td data-copy-value={String(setProgress.totalRow.totalCards)}>{setProgress.totalRow.totalCards}</td>
                    {setProgress.totalRow.thresholds.map((item) => (
                      <td
                        key={item.threshold}
                        className="set-progress-cell"
                        style={getProgressCellStyle(item.percent)}
                        data-copy-value={`${item.percent.toFixed(2)}%`}
                      >
                        {item.percent.toFixed(2)}%
                        <span className="set-progress-tooltip">
                          {item.owned} owned
                          <br />
                          {Math.max(0, item.required - item.owned)} missing
                        </span>
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pokemonStats && (
        <>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>✅</th>
                <th>☐</th>
                <th>⨊</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>🎮 Pokémon</td>
                <td><strong>{pokemonStats.global.pokemonOwned}</strong></td>
                <td>{pokemonStats.global.pokemonAvailable}</td>
                <td>{pokemonStats.global.pokemonTotal}</td>
              </tr>
              <tr>
                <td>🧬 Pokémon Forms</td>
                <td><strong>{pokemonStats.global.formsOwned}</strong></td>
                <td>{pokemonStats.global.formsAvailable}</td>
                <td>{pokemonStats.global.formsTotal}</td>
              </tr>
            </tbody>
          </table>

          {pokemonStats.regions.length > 1 && pokemonStats.regions.map(region => (
            <table key={region.regionName} className="summary-table">
              <thead>
                <tr>
                  <th colSpan={4}>{region.regionName}</th>
                </tr>
                <tr>
                  <th>Description</th>
                  <th>✅</th>
                  <th>☐</th>
                  <th>⨊</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>🎮 Pokémon</td>
                  <td><strong>{region.pokemonOwned}</strong></td>
                  <td>{region.pokemonAvailable}</td>
                  <td>{region.pokemonTotal}</td>
                </tr>
                <tr>
                  <td>🧬 Pokémon Forms</td>
                  <td><strong>{region.formsOwned}</strong></td>
                  <td>{region.formsAvailable}</td>
                  <td>{region.formsTotal}</td>
                </tr>
              </tbody>
            </table>
          ))}
        </>
      )}
    </div>
  );
};
