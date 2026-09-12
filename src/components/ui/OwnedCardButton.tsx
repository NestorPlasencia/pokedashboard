import { Library, LibraryBig } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import type { Card } from '../../types/dashboard';

/**
 * Records a card as owned in the collection armed on the Collections page.
 *
 * Shown only while a collection is armed, the same way the wishlist control waits for a
 * subcollection: with nothing armed there is no question of where the card would go, and a
 * stray click cannot record anything.
 *
 * Owning is not counted - a card is in the collection or it is not - so this is one
 * button that flips, not a stepper. Its own icon and colour keep it apart from the
 * wishlist control sitting directly above it, which does the same thing to a different list.
 */
export function OwnedCardButton({ card }: { card: Card }) {
  const owned = useOwnedCollections();
  // Cleared on every click, so a stale failure from a previous card never lingers here.
  const [failed, setFailed] = useState(false);
  if (!owned.selected || !owned.canTrack(card)) return null;

  const held = owned.has(card);
  const variant = card.variant || 'Normal';
  const target = owned.selected.name;
  const description = `${held ? 'Remove' : 'Add'} ${card.name} ${variant} ${held ? 'from' : 'to'} ${target}`;

  // `owned.add`/`owned.removeCard` resolve to whether the write actually landed. A failed
  // write only updates shared context state that the Collections page renders elsewhere,
  // so without this the button silently did nothing - clicking it looked broken with no
  // error anywhere on screen.
  const handleClick = async (event: MouseEvent) => {
    event.stopPropagation();
    setFailed(false);
    const ok = held ? await owned.removeCard(card) : await owned.add(card);
    if (!ok) setFailed(true);
  };

  return (
    <button
      type="button"
      className={`owned-card-button${held ? ' owned-card-button--held' : ''}${failed ? ' owned-card-button--failed' : ''}`}
      title={failed ? (owned.error || 'Could not save. Try again.') : description}
      aria-label={description}
      aria-pressed={held}
      onClick={handleClick}
    >
      {held
        ? <><LibraryBig size={12} aria-hidden="true" /> Remove</>
        : <><Library size={12} aria-hidden="true" /> Add</>}
      {failed && <span className="owned-card-button__error" role="alert">{owned.error || 'Failed'}</span>}
    </button>
  );
}
