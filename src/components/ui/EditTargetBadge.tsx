import { Pencil, X } from 'lucide-react';
import { useWishlists } from '../../context/WishlistsContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';

/**
 * States, wherever you are, that clicking a card will write something - and to where.
 *
 * Arming lives in two different sidebar panels, so without this the only evidence would be
 * a control appearing on the cards, which is exactly the thing that gets missed. Each entry
 * doubles as its own off switch, so disarming never means hunting for the panel again.
 */
export function EditTargetBadge() {
  const wishlists = useWishlists();
  const owned = useOwnedCollections();

  // Wanting a card and owning one are different acts, so both can be armed at once; they
  // are listed separately rather than merged into one ambiguous "editing" state.
  const targets = [
    wishlists.armedSubcollection && {
      key: 'wishlist',
      label: `Wishlist: ${wishlists.armedSubcollection.name}`,
      disarm: () => wishlists.setArmedSubId(''),
    },
    owned.selected && {
      key: 'collection',
      label: `Collection: ${owned.selected.name}`,
      disarm: () => owned.setSelectedId(''),
    },
  ].filter(Boolean) as { key: string; label: string; disarm: () => void }[];

  if (targets.length === 0) return null;

  return (
    <div className="edit-target-badges" role="status" aria-label="Card edits are armed">
      {targets.map((target) => (
        <button
          key={target.key}
          type="button"
          className={`edit-target-badge edit-target-badge--${target.key}`}
          onClick={target.disarm}
          title={`Stop adding to ${target.label}`}
          aria-label={`Stop adding to ${target.label}`}
        >
          <Pencil size={11} aria-hidden="true" />
          <span className="edit-target-badge__name">{target.label}</span>
          <X size={12} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
