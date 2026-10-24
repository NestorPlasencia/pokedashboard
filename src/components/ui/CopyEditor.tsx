import { LoaderCircle, Minus, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useCardContext } from '../../context/CardContext';
import { useOptionsContext } from '../../context/OptionsContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import type { Card, Collection, QuantityKey } from '../../types/dashboard';
import { quantityCollectionNames } from '../../utils/collectionQuantity';
import { CONDITION_ABBREVIATIONS, getBestAvailablePrice } from '../../utils/collectionValue';

const CONDITIONS: { key: QuantityKey; label: string }[] = [
  { key: 'Near Mint', label: 'Near Mint' },
  { key: 'Lightly Played', label: 'Lightly Played' },
  { key: 'Moderately Played', label: 'Moderately Played' },
  { key: 'Heavily Played', label: 'Heavily Played' },
  { key: 'Damaged', label: 'Damaged' },
  { key: 'Unknown', label: 'No condition' },
];

type Counts = Partial<Record<QuantityKey, number>>;
export type EditableEntry = Collection & { id: string };

const total = (counts: Counts) => Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0);
const formatPrice = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const stop = (event: MouseEvent) => event.stopPropagation();

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
    return (card.collections ?? []).filter((entry): entry is EditableEntry =>
      Boolean(entry.id && editableIds.has(entry.id) && scope.has(entry.name)));
  }, [card.collections, viewMode, collections, collectionFilter.selectedCollections, owned.collections]);

  if (!entries.length || !owned.canTrack(card)) return null;

  const keyOf = (entry: EditableEntry) => `${entry.id}|${entry.printing ?? ''}`;
  const countsOf = (entry: EditableEntry) => drafts[keyOf(entry)] ?? entry.quantity;
  const changed = entries.filter(entry => drafts[keyOf(entry)] &&
    CONDITIONS.some(({ key }) => (drafts[keyOf(entry)][key] ?? 0) !== (entry.quantity[key] ?? 0)));

  const close = () => { setOpen(false); setDrafts({}); setFailed(''); };
  const step = (entry: EditableEntry, key: QuantityKey, delta: number) => {
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
    {open && <CopyEditorDialog card={card} entries={entries.map(entry => ({ entry, counts: countsOf(entry) }))}
      onStep={step} saving={saving} failed={failed} changes={changed.length} onClose={close} onSave={() => void save()} />}
  </>;
}

/**
 * The editor itself, rendered over the page rather than inside the tile so every
 * condition has a full row: its name, what a copy is worth, and a stepper.
 */
export function CopyEditorDialog({ card, entries, onStep, saving, failed, changes, onClose, onSave }: {
  card: Card;
  entries: { entry: EditableEntry; counts: Counts }[];
  onStep: (entry: EditableEntry, key: QuantityKey, delta: number) => void;
  saving: boolean;
  failed: string;
  changes: number;
  onClose: () => void;
  onSave: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // The same price a copy in each condition is valued at in the summary.
  const fallbackPrice = getBestAvailablePrice(card);
  const priceOf = (key: QuantityKey) => key === 'Unknown' ? fallbackPrice : card.prices?.[key] ?? fallbackPrice;

  // A dialog takes the keyboard: focus moves in, and the page behind does not scroll.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('.copy-editor__stepper button:not(:disabled)')?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  return createPortal(<div className="copy-editor-backdrop" onClick={event => { stop(event); if (!saving) onClose(); }}>
    <div ref={dialogRef} className="copy-editor" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={stop}
      onKeyDown={event => { if (event.key === 'Escape' && !saving) onClose(); }}>
      <header className="copy-editor__header">
        {card.image && <img src={card.image} alt="" />}
        <div>
          <h3 id={titleId}>{card.name}</h3>
          <p>{card.setName}{card.number ? ` · ${card.number}` : ''}{card.printing || card.variant ? ` · ${card.printing || card.variant}` : ''}</p>
        </div>
        <button type="button" className="copy-editor__close" aria-label="Close without saving" disabled={saving} onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      {entries.map(({ entry, counts }) => {
        const value = CONDITIONS.reduce((sum, { key }) => sum + (priceOf(key) ?? 0) * (counts[key] ?? 0), 0);
        const copies = total(counts);
        return <section key={`${entry.id}|${entry.printing ?? ''}`} className="copy-editor__collection" aria-label={entry.name}>
          <h4>{entry.name}</h4>
          {CONDITIONS.filter(({ key }) => key !== 'Unknown' || (counts.Unknown ?? 0) > 0 || (entry.quantity.Unknown ?? 0) > 0).map(({ key, label }) => {
            const count = counts[key] ?? 0;
            const price = priceOf(key);
            return <div key={key} className={`copy-editor__row${count ? ' has-copies' : ''}`}>
              <span className="copy-editor__condition">
                <abbr title={label}>{CONDITION_ABBREVIATIONS[key] || '—'}</abbr>
                <span>{label}</span>
              </span>
              <span className="copy-editor__price">{price === null ? '' : formatPrice(price)}</span>
              <span className="copy-editor__stepper">
                <button type="button" aria-label={`One less ${label}`} disabled={saving || !count} onClick={() => onStep(entry, key, -1)}><Minus size={16} aria-hidden="true" /></button>
                <output aria-live="polite" aria-label={`${count} ${label}`}>{count}</output>
                <button type="button" aria-label={`One more ${label}`} disabled={saving} onClick={() => onStep(entry, key, 1)}><Plus size={16} aria-hidden="true" /></button>
              </span>
            </div>;
          })}
          <div className="copy-editor__total">
            <span>{copies} {copies === 1 ? 'copy' : 'copies'}</span>
            <strong>{formatPrice(value)}</strong>
          </div>
        </section>;
      })}
      {failed && <p className="copy-editor__error" role="alert">{failed}</p>}
      <footer className="copy-editor__actions">
        <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="copy-editor__save" onClick={onSave} disabled={saving || !changes}>
          {saving ? <><LoaderCircle size={14} className="card-action-spinner" aria-hidden="true" /> Saving…</> : changes ? 'Save changes' : 'No changes'}
        </button>
      </footer>
    </div>
  </div>, document.body);
}
