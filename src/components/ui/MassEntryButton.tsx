import React, { useMemo, useState } from "react";
import { useCardContext } from "../../context/CardContext";
import type { Card } from "../../types/dashboard";

const writeToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
};

const formatMassEntryLine = (card: Card): string | null => {
  const name = card.tcgPlayerName || card.name;
  const number = card.tcgPlayerNumber || card.number;
  const abbreviation = card.tcgPlayerSetAbbreviation;
  if (!name || !number || !abbreviation) return null;

  return `1 ${name} [${abbreviation}] ${number}`;
};

const getMissingMassEntryMetadata = (card: Card): string[] => {
  const missing: string[] = [];

  if (!(card.tcgPlayerName || card.name)) missing.push("name");
  if (!(card.tcgPlayerNumber || card.number)) missing.push("number");
  if (!card.tcgPlayerSetAbbreviation) missing.push("set abbreviation");

  return missing;
};

export const MassEntryButton: React.FC = () => {
  const { visibleCards } = useCardContext();
  const [status, setStatus] = useState<"idle" | "copied" | "partial" | "error">(
    "idle"
  );

  const { lines, skippedCards } = useMemo(() => {
    const cards = visibleCards.filter(
      (card): card is Card => !("isPlaceholder" in card)
    );
    const validLines: string[] = [];
    const invalidCards: Array<Record<string, string | undefined>> = [];

    for (const card of cards) {
      const line = formatMassEntryLine(card);
      if (!line) {
        invalidCards.push({
          card: card.name,
          number: card.number,
          set: card.setName,
          setId: card.setId,
          tcgPlayerName: card.tcgPlayerName,
          tcgPlayerNumber: card.tcgPlayerNumber,
          tcgPlayerSetAbbreviation: card.tcgPlayerSetAbbreviation,
          missing: getMissingMassEntryMetadata(card).join(", "),
        });
        continue;
      }
      validLines.push(line);
    }

    return { lines: validLines, skippedCards: invalidCards };
  }, [visibleCards]);

  const skipped = skippedCards.length;

  const handleCopy = async () => {
    if (lines.length === 0) return;

    if (skipped > 0) {
      console.warn(
        `[Mass Entry] Skipped ${skipped} cards with missing metadata:`
      );
      console.table(skippedCards);
    }

    try {
      await writeToClipboard(lines.join("\n"));
      setStatus(skipped > 0 ? "partial" : "copied");
    } catch {
      setStatus("error");
    }
  };

  const label =
    status === "copied"
      ? `Copied ${lines.length}`
      : status === "partial"
        ? `Copied ${lines.length}; skipped ${skipped}`
        : status === "error"
          ? "Copy failed"
          : "Copy Mass Entry";

  return (
    <button
      type="button"
      className="mass-entry-btn"
      onClick={handleCopy}
      disabled={lines.length === 0}
      title="Copy visible cards in TCGPlayer Mass Entry format"
    >
      {label}
    </button>
  );
};
