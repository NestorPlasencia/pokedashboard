import { Check, Trash2 } from 'lucide-react';
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import type { ConditionKey } from '../../types/dashboard';
import type { ScanDraft } from '../../utils/cardScanner';
import { navigate } from '../../utils/route';

const SCAN_CONDITIONS: ConditionKey[] = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];

export function ScannerReview({ entries, setEntries, scanning, onSavingChange }: {
  entries: ScanDraft[];
  setEntries: Dispatch<SetStateAction<ScanDraft[]>>;
  scanning: boolean;
  onSavingChange: (saving: boolean) => void;
}) {
  const { session } = useAuth();
  const owned = useOwnedCollections();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState('');
  const savingRef = useRef(false);
  const selected = entries.filter(entry => entry.approved);
  const editableIds = new Set(owned.collections.map(collection => collection.id));
  const valid = (entry: ScanDraft) => Boolean(editableIds.has(entry.collectionId) && entry.candidates.some(card => card.id === entry.cardId && owned.canTrack(card)));
  const locked = saving || scanning;
  const patch = (id: string, change: Partial<ScanDraft>) => setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...change } : entry));

  const confirm = async () => {
    if (savingRef.current || scanning || !session || !owned.synced || !selected.length || !selected.every(valid)) return;
    savingRef.current = true; setSaving(true); onSavingChange(true); setNotice(''); setFailed('');
    let count = 0;
    try {
      for (const entry of selected) {
        const card = entry.candidates.find(candidate => candidate.id === entry.cardId);
        if (!card) continue;
        const saved = await owned.addScan(card, entry.condition, entry.id, entry.collectionId);
        if (!saved) { setFailed('No se pudo guardar una carta. Las pendientes siguen en revisión; puedes reintentar sin duplicar las ya guardadas.'); break; }
        count++;
        setEntries(current => current.filter(candidate => candidate.id !== entry.id));
      }
      if (count) setNotice(`${count} ${count === 1 ? 'copia añadida' : 'copias añadidas'} a la colección.`);
    } catch {
      setFailed('No se pudo completar el guardado. Las cartas pendientes conservan su identidad para reintentar sin duplicados.');
    } finally { savingRef.current = false; setSaving(false); onSavingChange(false); }
  };

  return <section className="scanner-panel scanner-review">
    <h2>Revisión · {entries.length} pendientes</h2>
    <p>Escanear sólo crea pendientes. Revisa la carta, la impresión, el estado y el destino; selecciona las correctas y confirma el guardado.</p>
    {!entries.length && <p>Las cartas detectadas aparecerán aquí mientras las vas pasando.</p>}
    {scanning && entries.length > 0 && <p>Pausa el video para revisar y guardar este lote.</p>}
    {entries.length > 0 && <div className="scanner-actions">
      <button type="button" className="collections-page__btn" disabled={locked} onClick={() => setEntries(current => current.map(entry => ({ ...entry, approved: valid(entry) })))}>Seleccionar todas las resueltas</button>
      <button type="button" className="collections-page__btn" disabled={locked || !selected.length} onClick={() => setEntries(current => current.map(entry => ({ ...entry, approved: false })))}>Quitar selección</button>
    </div>}
    <div className="scanner-matches">
      {entries.map(entry => {
        const card = entry.candidates.find(candidate => candidate.id === entry.cardId);
        const collection = owned.collections.find(candidate => candidate.id === entry.collectionId);
        return <article key={entry.id} className={`scanner-review-item${entry.approved ? ' is-approved' : ''}`}>
          <div className="scanner-match scanner-match--saved">
            <label className="scanner-review-check"><input type="checkbox" aria-label={`Revisada: ${card?.name || 'carta sin resolver'}`} checked={entry.approved} disabled={locked || !valid(entry)} onChange={event => patch(entry.id, { approved: event.target.checked })} /></label>
            <img src={(card ?? entry.candidates[0]).image} alt={card?.name || 'Posible coincidencia'} loading="lazy" />
            <span><strong>{card?.name || 'Elige la coincidencia correcta'}</strong><span>{card ? `${card.setName} · ${card.number}` : entry.candidates[0]?.name}</span><small>{card ? `${card.printing || card.variant} · ${entry.condition}` : entry.note}</small><small>{collection?.name || 'Sin colección de destino'}</small></span>
            <button type="button" className="collections-page__btn" title="Descartar lectura" aria-label={`Descartar ${card?.name || 'lectura'}`} disabled={locked} onClick={() => setEntries(current => current.filter(candidate => candidate.id !== entry.id))}><Trash2 size={16} /></button>
          </div>
          <details className="scanner-review-item__details" open={!card}>
            <summary>{card ? 'Editar carta, estado y destino' : 'Resolver esta lectura'}</summary>
          <fieldset className="scanner-scope" disabled={locked}>
            <legend className="scanner-sr-only">Corregir carta y atributos de esta copia</legend>
            <label>Carta, variante e impresión<select value={entry.cardId} onChange={event => patch(entry.id, { cardId: event.target.value, approved: false })}>
              <option value="">Selecciona la coincidencia correcta</option>
              {entry.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.setName} #{candidate.number} · {candidate.printing || candidate.variant} · {candidate.variant}</option>)}
            </select></label>
            <label>Estado de la copia<select value={entry.condition} onChange={event => patch(entry.id, { condition: event.target.value as ConditionKey, approved: false })}>{SCAN_CONDITIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Destino de la copia<select value={editableIds.has(entry.collectionId) ? entry.collectionId : ''} onChange={event => patch(entry.id, { collectionId: event.target.value, approved: false })}>
              <option value="">Selecciona la colección</option>
              {owned.collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select></label>
          </fieldset>
          </details>
        </article>;
      })}
    </div>
    {entries.length > 0 && <div className="scanner-review-footer">
      <small>{selected.length} de {entries.length} seleccionadas</small>
      {!session && <button type="button" className="collections-page__btn" onClick={() => navigate('collections')}>Inicia sesión para guardar la revisión</button>}
      {session && <button type="button" className="collections-page__btn collections-page__btn--primary" disabled={locked || !owned.synced || !selected.length || !selected.every(valid)} onClick={() => void confirm()}><Check size={16} />{saving ? 'Guardando…' : `Añadir ${selected.length} revisadas`}</button>}
    </div>}
    {notice && <p role="status" className="scanner-notice">{notice}</p>}
    {(failed || owned.error) && <p role="alert" className="scanner-error">{failed || owned.error}</p>}
  </section>;
}
