import { LoaderCircle, Minus, Pencil, Plus, X } from 'lucide-react';
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { useCardContext } from '../../context/CardContext';
import { useOptionsContext } from '../../context/OptionsContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import type { Card, Collection, QuantityKey } from '../../types/dashboard';
import { quantityCollectionNames } from '../../utils/collectionQuantity';

const CONDITIONS: { key: QuantityKey; label: string }[] = [
  { key: 'Near Mint', label: 'Near Mint' },
  { key: 'Lightly Played', label: 'Lightly Played' },
  { key: 'Moderately Played', label: 'Moderately Played' },
  { key: 'Heavily Played', label: 'Heavily Played' },
  { key: 'Damaged', label: 'Damaged' },
  { key: 'Unknown', label: 'No condition' },
];

type Counts = Partial<Record<QuantityKey, number>>;
const total = (counts: Counts) => Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0);

/**
 * Edits how many copies of a card a viewed collection holds in each condition.
 *
 * Only in a collection view, and only for the user's own collections in that view: those
 * are the copies the counter on the card is counting, and the ones the app may change.
 * Changes are a draft until Save, so a few taps become one write.
 */
export function CopyEditor({ card }: { card: Card }) {
  const owned = useOwnedCollections();
  const { viewMode, collectionFilter } = useCardContext();
  const { collections } = useOptionsContext();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Counts>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState('');
  const busy = useRef(false);

  const entries = useMemo(() => {
    if (viewMode.kind !== 'collection') return [];
    const scope = new Set(quantityCollectionNames(viewMode, collections, collectionFilter.selectedCollections));
    const editableIds = new Set(owned.collections.map(collection => collection.id));
    return (card.collections ?? []).filter((entry): entry is Collection & { id: string } =>
      Boolean(entry.id && editableIds.has(entry.id) && scope.has(entry.name)));
  }, [card.collections, viewMode, collections, collectionFilter.selectedCollections, owned.collections]);

  if (!entries.length || !owned.canTrack(card)) return null;

  const keyOf = (entry: Collection & { id: string }) => `${entry.id}|${entry.printing ?? ''}`;
  const countsOf = (entry: Collection & { id: string }) => drafts[keyOf(entry)] ?? entry.quantity;
  const changed = entries.filter(entry => drafts[keyOf(entry)] &&
    CONDITIONS.some(({ key }) => (drafts[keyOf(entry)][key] ?? 0) !== (entry.quantity[key] ?? 0)));

  const stop = (event: MouseEvent) => event.stopPropagation();
  const close = () => { setOpen(false); setDrafts({}); setFailed(''); };
  const step = (entry: Collection & { id: string }, key: QuantityKey, delta: number) => {
    const counts = countsOf(entry);
    setDrafts(current => ({ ...current, [keyOf(entry)]: { ...counts, [key]: Math.max(0, Math.min(999, (counts[key] ?? 0) + delta)) } }));
  };

  const save = async () => {
    if (busy.current || !changed.length) return;
    busy.current = true; setSaving(true); setFailed('');
    try {
      for (const entry of changed) {
        const ok = await owned.setCopies(card, entry.id, drafts[keyOf(entry)], entry.printing ?? null);
        if (!ok) { setFailed(owned.error || 'Could not save. Try again.'); return; }
      }
      close();
    } catch {
      setFailed('Could not save. Try again.');
    } finally {
      busy.current = false; setSaving(false);
    }
  };

  return <>
    <button type="button" className="copy-editor-button" title={`Edit copies of ${card.name}`} aria-label={`Edit copies and conditions of ${card.name}`}
      aria-expanded={open} onClick={event => { stop(event); if (open) close(); else setOpen(true); }}>
      <Pencil size={12} aria-hidden="true" />
    </button>
    {open && <div className="copy-editor" role="dialog" aria-label={`Copies of ${card.name}`} onClick={stop}>
      <div className="copy-editor__header">
        <strong>Copies</strong>
        <button type="button" className="copy-editor__close" aria-label="Close without saving" onClick={close}><X size={14} aria-hidden="true" /></button>
      </div>
      {entries.map(entry => {
        const counts = countsOf(entry);
        return <section key={keyOf(entry)} className="copy-editor__collection" aria-label={entry.name}>
          {entries.length > 1 && <h4>{entry.name}{entry.printing ? ` · ${entry.printing}` : ''}</h4>}
          {CONDITIONS.filter(({ key }) => key !== 'Unknown' || (counts.Unknown ?? 0) > 0 || (entry.quantity.Unknown ?? 0) > 0).map(({ key, label }) =>
            <div key={key} className="copy-editor__row">
              <span>{label}</span>
              <button type="button" aria-label={`One less ${label}`} disabled={saving || !(counts[key] ?? 0)} onClick={() => step(entry, key, -1)}><Minus size={12} aria-hidden="true" /></button>
              <output aria-live="polite">{counts[key] ?? 0}</output>
              <button type="button" aria-label={`One more ${label}`} disabled={saving} onClick={() => step(entry, key, 1)}><Plus size={12} aria-hidden="true" /></button>
            </div>)}
          <div className="copy-editor__total">Total <strong>{total(counts)}</strong></div>
        </section>;
      })}
      {failed && <p className="copy-editor__error" role="alert">{failed}</p>}
      <div className="copy-editor__actions">
        <button type="button" onClick={close} disabled={saving}>Cancel</button>
        <button type="button" className="copy-editor__save" onClick={() => void save()} disabled={saving || !changed.length}>
          {saving ? <><LoaderCircle size={12} className="card-action-spinner" aria-hidden="true" /> Saving…</> : 'Save'}
        </button>
      </div>
    </div>}
  </>;
}
