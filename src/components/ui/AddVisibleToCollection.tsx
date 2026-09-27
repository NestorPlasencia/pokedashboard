import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCardContext } from '../../context/CardContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import type { Card } from '../../types/dashboard';

export function AddVisibleToCollection({ loading }: { loading: boolean }) {
  const { renderCards, trendLoading } = useCardContext();
  const owned = useOwnedCollections();
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    return renderCards.filter((item): item is Card => {
      if ('isPlaceholder' in item || !owned.canTrack(item) || owned.has(item)) return false;
      const key = JSON.stringify([item.productId, item.printing || item.variant || null]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [renderCards, owned]);
  const target = owned.selected;
  const signature = target && JSON.stringify([target.id, candidates.map((card) => [card.productId, card.printing || card.variant || null])]);
  const isConfirming = Boolean(signature && confirmation === signature);

  if (!target || !owned.synced || (!candidates.length && !notice)) return null;

  const addVisible = async () => {
    if (!signature || saving || loading || trendLoading) return;
    if (!isConfirming) {
      setConfirmation(signature);
      setNotice('');
      return;
    }
    setSaving(true);
    setConfirmation('');
    const added = await owned.addMany(candidates);
    setNotice(added > 0 ? `${added} cards added to ${target.name}.` : 'No cards were added. Check the collection and try again.');
    setSaving(false);
  };

  return <div className="collection-bulk-add">
    {candidates.length > 0 && <>
      <button type="button" onClick={addVisible} disabled={loading || trendLoading || saving}>
        <Plus size={14} aria-hidden="true" />
        {saving ? 'Adding…' : isConfirming ? `Confirm: add ${candidates.length} cards` : `Add all ${candidates.length} visible cards to ${target.name}`}
      </button>
      {isConfirming && <button type="button" className="collection-bulk-add__cancel" onClick={() => setConfirmation('')}>Cancel</button>}
    </>}
    {notice && <span role="status">{notice}</span>}
  </div>;
}
