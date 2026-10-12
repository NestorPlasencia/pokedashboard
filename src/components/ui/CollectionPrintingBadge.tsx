import { FlipHorizontal2, Infinity as InfinityIcon, List, Package, RectangleVertical, Shapes, Sparkles, type LucideIcon } from "lucide-react";

const PRINTING_ICONS: Record<string, { icon: LucideIcon; edition?: "first" | "unlimited" }> = {
  Normal: { icon: RectangleVertical },
  Holofoil: { icon: Sparkles },
  "Reverse Holofoil": { icon: FlipHorizontal2 },
  "1st Edition": { icon: RectangleVertical, edition: "first" },
  "1st Edition Holofoil": { icon: Sparkles, edition: "first" },
  "Unlimited Holofoil": { icon: Sparkles, edition: "unlimited" },
  Sealed: { icon: Package },
  Listed: { icon: List },
  Other: { icon: Shapes },
};

export function CollectionPrintingBadge({ printing }: { printing: string }) {
  const { icon: Icon, edition } = PRINTING_ICONS[printing] ?? { icon: Shapes };
  return (
    <span className="collection-printing-icon" role="img" aria-label={printing} title={printing}>
      <Icon size={14} aria-hidden="true" />
      {edition === "first" && <span className="collection-printing-icon__edition" aria-hidden="true">1</span>}
      {edition === "unlimited" && <InfinityIcon size={10} aria-hidden="true" />}
    </span>
  );
}
