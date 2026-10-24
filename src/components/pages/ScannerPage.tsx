import { BookOpen, Check, ListChecks, Pause, Play, ScanLine } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCardContext } from '../../context/CardContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import { createCardOcr } from '../../services/cardOcr';
import { COLLECTION_PRINTING_ORDER } from '../../services/inventory';
import { readScannerReview, saveScannerReview } from '../../services/scannerReview';
import type { ConditionKey } from '../../types/dashboard';
import { automaticScanMatch, createScanGate, groupScanCards, rankScanMatches, type ScanDraft } from '../../utils/cardScanner';
import { scannerCatalogCards } from '../../utils/scannerCatalog';
import { navigate, openCardsView } from '../../utils/route';
import { parseUrlParams } from '../../utils/urlParams';
import { ScannerCamera } from '../scanner/ScannerCamera';
import { ScannerReview } from '../scanner/ScannerReview';
import './scanner.css';

const CONDITIONS: ConditionKey[] = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];
type ScannerStep = 'setup' | 'camera' | 'review';

export function ScannerPage({ catalogLoading = false, catalogError }: { catalogLoading?: boolean; catalogError?: string | null }) {
  const { session } = useAuth();
  const { renderCards, seriesSelection, selectedSets, activeFilterChips, viewMode, priceRange, collectionFilter, pokemonGrouping } = useCardContext();
  const owned = useOwnedCollections();
  const [printing, setPrinting] = useState('');
  const [condition, setCondition] = useState<ConditionKey>('Near Mint');
  const [running, setRunning] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState('');
  const [status, setStatus] = useState('Lista para escanear la selección del catálogo. Las cartas pasarán a revisión.');
  const [error, setError] = useState('');
  const ownerId = session?.user.id ?? '';
  const [restoredReview] = useState(() => {
    try { return { entries: readScannerReview(localStorage, ownerId), available: true }; }
    catch { return { entries: [] as ScanDraft[], available: false }; }
  });
  const [drafts, setDrafts] = useState(restoredReview.entries);
  const [mobileStep, setMobileStep] = useState<ScannerStep>(restoredReview.entries.length ? 'review' : 'setup');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [storageError, setStorageError] = useState(restoredReview.available ? '' : 'No se pudo leer la revisión guardada. La revisión nueva sólo estará disponible mientras esta página siga abierta.');
  const [guestDraftCount, setGuestDraftCount] = useState(() => {
    try { return ownerId ? readScannerReview(localStorage, '').length : 0; } catch { return 0; }
  });
  const [lastText, setLastText] = useState('');
  const ocrRef = useRef<ReturnType<typeof createCardOcr> | null>(null);
  const gate = useRef(createScanGate());
  const mounted = useRef(false);
  const processing = useRef(false);
  const active = useRef(false);
  const generation = useRef(0);
  const sessionSignature = useRef('');
  const pageRef = useRef<HTMLDivElement>(null);
  const cameraPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!restoredReview.available) return;
    try { saveScannerReview(localStorage, ownerId, drafts); }
    catch { setStorageError('No se pudo respaldar la revisión en este dispositivo. Mantén esta página abierta hasta terminar.'); }
  }, [drafts, ownerId, restoredReview.available]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; active.current = false;
      ocrRef.current?.dispose(); ocrRef.current = null;
    };
  }, []);

  useEffect(() => {
    const revealCamera = () => {
      if (mobileStep === 'camera' && window.matchMedia('(max-width: 900px)').matches) {
        pageRef.current?.scrollTo({ top: 0 });
      } else if (mobileStep === 'camera' && active.current) cameraPanelRef.current?.scrollIntoView({ block: 'start' });
    };
    window.addEventListener('resize', revealCamera);
    return () => window.removeEventListener('resize', revealCamera);
  }, [mobileStep]);

  const scopedCards = useMemo(() => scannerCatalogCards(renderCards), [renderCards]);
  const printings = useMemo(() => {
    const values = [...new Set(scopedCards.map(card => card.printing || card.variant).filter(Boolean))];
    const rank = (value: string) => { const index = (COLLECTION_PRINTING_ORDER as readonly string[]).indexOf(value); return index < 0 ? 999 : index; };
    return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [scopedCards]);
  const scanCards = useMemo(() => printing ? scopedCards.filter(card => (card.printing || card.variant) === printing) : scopedCards, [scopedCards, printing]);
  const count = useMemo(() => groupScanCards(scanCards).length, [scanCards]);
  const catalogSignature = useMemo(() => JSON.stringify(scopedCards.map(card => [card.id, card.printing || card.variant]).sort()), [scopedCards]);
  const locked = running || working || reviewSaving;
  const canStart = Boolean(count && !catalogLoading && !catalogError && !reviewSaving);
  const printingLabel = printing || (printings.length === 1 ? printings[0] : 'Impresión del catálogo');
  const search = parseUrlParams().search;
  const sourceChips = [
    ...seriesSelection.included.map(value => `Era: ${value}`),
    ...seriesSelection.excluded.map(value => `Era excluida: ${value}`),
    ...selectedSets.map(value => `Set: ${value}`),
    ...activeFilterChips.map(chip => chip.label),
    ...(viewMode.kind === 'collection' ? [`Colección: ${viewMode.names.join(', ')}`] : viewMode.kind === 'wishlist' ? ['Lista de deseos seleccionada'] : []),
    ...(search ? [`Búsqueda: ${search}`] : []),
    ...(priceRange.min !== null || priceRange.max !== null ? [`Precio: ${priceRange.min ?? '0'} – ${priceRange.max ?? 'sin límite'}`] : []),
    ...(collectionFilter.enabled && collectionFilter.mode !== 'none' ? [`Colecciones: ${collectionFilter.mode} · ${collectionFilter.selectedCollections.join(', ')}`] : []),
    ...(pokemonGrouping.enabled && pokemonGrouping.allowVariants.length ? [`Formas: ${pokemonGrouping.allowVariants.join(', ')}`] : []),
  ];

  useEffect(() => {
    if (running && (!canStart || sessionSignature.current !== JSON.stringify([session?.user.id, owned.selectedId, printing, condition, catalogSignature]))) {
      active.current = false; generation.current++;
      setRunning(false);
      setStatus('Sesión pausada: cambió la selección del catálogo o el lote.');
    }
  }, [running, canStart, session?.user.id, owned.selectedId, printing, condition, catalogSignature]);

  const pause = (message = 'Sesión pausada. Pulsa Continuar para seguir.') => {
    active.current = false; generation.current++;
    if (mounted.current) { setRunning(false); setStatus(message); setProgress(''); }
  };

  const showStep = (step: ScannerStep) => {
    if (step !== 'camera' && active.current) pause('Video pausado para revisar o cambiar el lote.');
    setMobileStep(step);
    if (window.matchMedia('(max-width: 900px)').matches || step === 'setup') pageRef.current?.scrollTo({ top: 0 });
    else if (step === 'review') pageRef.current?.querySelector<HTMLElement>('.scanner-review')?.scrollIntoView({ block: 'start' });
    else cameraPanelRef.current?.scrollIntoView({ block: 'start' });
  };

  const start = () => {
    if (!canStart || processing.current) return;
    const signature = JSON.stringify([session?.user.id, owned.selectedId, printing, condition, catalogSignature]);
    if (signature !== sessionSignature.current) {
      gate.current.rearm();
      sessionSignature.current = signature;
    }
    generation.current++;
    setMobileStep('camera');
    active.current = true; setRunning(true); setError(''); setStatus('Abriendo cámara…');
    // Scroll after the mobile pane is visible. On desktop, bring the camera into view.
    window.requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 900px)').matches) pageRef.current?.scrollTo({ top: 0 });
      else cameraPanelRef.current?.scrollIntoView({ block: 'start' });
      cameraPanelRef.current?.querySelector<HTMLButtonElement>('.scanner-session-actions button')?.focus({ preventScroll: true });
    });
  };

  const readFrame = async (image: HTMLCanvasElement) => {
    if (!active.current || processing.current || !canStart) return;
    const current = generation.current;
    processing.current = true; setWorking(true);
    try {
      ocrRef.current ??= createCardOcr(message => { if (mounted.current && active.current) setProgress(message); });
      const text = await ocrRef.current.recognize(image);
      if (!mounted.current || !active.current || current !== generation.current) return;
      setLastText(`${text.name}\n${text.number}`.trim());
      setProgress('');
      const matches = rankScanMatches(scanCards, text.name, text.number);
      const certain = automaticScanMatch(matches);
      const match = matches[0];
      if (!match) {
        gate.current.observe(null);
        setStatus(text.detected ? `Leyendo carta entre las ${count} del catálogo… Mantén el nombre y el número enfocados.` : 'Acerca la carta y deja visibles sus cuatro bordes. Evita los reflejos.');
        return;
      }
      const stable = gate.current.observe(match.key);
      if (gate.current.isLatched(match.key)) {
        setStatus(`${match.cards[0].name} enviada a revisión. Pasa la siguiente carta.`);
        return;
      }
      if (!stable) {
        setStatus(`${match.cards[0].name} detectada. Mantenla quieta para confirmar la lectura…`);
        return;
      }
      const keys = new Set(matches.slice(0, 6).map(candidate => candidate.key));
      const candidates = groupScanCards(scopedCards).filter(group => keys.has(group.key)).flatMap(group => group.cards);
      const draft: ScanDraft = {
        id: crypto.randomUUID(), candidates, cardId: certain?.card.id ?? '', condition,
        collectionId: owned.selected?.id ?? '', approved: false,
        note: certain ? 'Nombre y número coinciden. Pendiente de revisión.' : 'Lectura dudosa: elige la carta y la impresión correctas.',
        createdAt: new Date().toISOString(),
      };
      gate.current.commit(match.key);
      setDrafts(entries => [draft, ...entries]);
      if (active.current) setStatus(`${match.cards[0].name} enviada a revisión. Pasa la siguiente carta.`);
      if (active.current) navigator.vibrate?.(80);
    } catch {
      if (mounted.current && active.current && current === generation.current) {
        setError('No se pudo completar el OCR. Revisa la conexión para cargar el motor e inténtalo otra vez.');
        pause('Sesión pausada por un error de lectura.');
        ocrRef.current?.dispose(); ocrRef.current = null;
      }
    } finally {
      processing.current = false;
      if (mounted.current) { setWorking(false); setProgress(''); }
    }
  };

  return <div ref={pageRef} className={`collections-page scanner-page scanner-step--${mobileStep}${running ? ' scanner-page--running' : ''}`}>
    <main className="collections-page__body">
      <div className="collections-page__intro">
        <h1><ScanLine size={26} aria-hidden="true" /> Escaneo continuo</h1>
        <p>Usa las cartas que tienes filtradas en el catálogo y pásalas frente a la cámara. Se acumulan en revisión; sólo las confirmadas se añaden a tu colección.</p>
      </div>
      <nav className="scanner-step-nav" aria-label="Pasos del escáner">
        <button type="button" aria-pressed={mobileStep === 'setup'} disabled={reviewSaving} onClick={() => showStep('setup')}><BookOpen size={18} aria-hidden="true" /><span>Catálogo</span></button>
        <button type="button" aria-pressed={mobileStep === 'camera'} disabled={reviewSaving} onClick={() => showStep('camera')}><ScanLine size={18} aria-hidden="true" /><span>Escanear</span>{running && <span className="scanner-live-dot" aria-label="Video activo" />}</button>
        <button type="button" aria-pressed={mobileStep === 'review'} onClick={() => showStep('review')}><ListChecks size={18} aria-hidden="true" /><span>Revisar</span><span className="scanner-step-count">{drafts.length}</span></button>
      </nav>
      <div className="scanner-setup">
      <section className="scanner-panel scanner-catalog" aria-label="Selección del catálogo">
        <div className="scanner-catalog__heading"><h2><BookOpen size={20} aria-hidden="true" /> Selección del catálogo</h2><span className="scanner-catalog__sync"><Check size={14} aria-hidden="true" /> Sincronizada</span></div>
        <p className="scanner-catalog__count" role="status">{catalogLoading ? 'Cargando selección…' : `${groupScanCards(scopedCards).length} cartas para identificar`}</p>
        <p>El escáner busca entre las mismas cartas que ves en el catálogo.</p>
        <div className="scanner-catalog__chips" aria-label="Filtros heredados del catálogo">
          {sourceChips.map((label, index) => <span key={`${index}-${label}`}>{label}</span>)}
          {!sourceChips.length && <span>Todos los resultados del catálogo</span>}
        </div>
        {owned.selected && <p className="scanner-catalog__destination">Destino del catálogo: <strong>{owned.selected.name}</strong></p>}
        {catalogError && <p className="scanner-error" role="alert">{catalogError}</p>}
        {!catalogLoading && !catalogError && !scopedCards.length && <p role="status">No hay cartas en esta selección. Ajusta los filtros en el catálogo.</p>}
        <button type="button" className="collections-page__btn" disabled={locked} onClick={openCardsView}>Cambiar en el catálogo</button>
      </section>
      <section className="scanner-panel">
        <h2>Atributos de las copias</h2>
        <fieldset disabled={locked} className="scanner-scope scanner-batch">
          <legend className="scanner-sr-only">Destino y atributos de todas las copias del lote</legend>
          <label>Colección de destino<select value={owned.selected?.id ?? ''} disabled={!owned.synced} onChange={event => owned.setSelectedId(event.target.value)}>
            <option value="">Selecciona tu colección</option>
            {owned.collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select></label>
          <label>Impresión<select value={printing} onChange={event => setPrinting(event.target.value)}>
            <option value="">Usar catálogo{printings.length === 1 ? ` · ${printings[0]}` : ''}</option>
            {printing && !printings.includes(printing) && <option value={printing}>{printing} · fuera de la selección</option>}
            {printings.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label>Estado<select value={condition} onChange={event => setCondition(event.target.value as ConditionKey)}>
            {CONDITIONS.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
        </fieldset>
        <p className="scanner-count" role="status">{catalogLoading ? 'Cargando cartas…' : `${count} cartas con estos ajustes`}</p>
        {!session && <p>Puedes escanear a revisión sin iniciar sesión. <button type="button" className="collections-page__btn" onClick={() => navigate('collections')}>Inicia sesión para elegir una colección</button></p>}
        {session && !owned.collections.length && <p>Crea una colección editable o una subcolección. <button type="button" className="collections-page__btn" onClick={() => navigate('collections')}>Ir a colecciones</button></p>}
        <small>Estos ajustes se aplican a cada copia nueva. Pausa el video para cambiar de lote.</small>
        <button type="button" className="collections-page__btn collections-page__btn--primary scanner-setup-start" disabled={!canStart || locked} onClick={start}><ScanLine size={18} aria-hidden="true" />Abrir cámara y empezar</button>
      </section>
      </div>
      <div className="scanner-columns">
        <section ref={cameraPanelRef} className="scanner-panel scanner-camera-panel" aria-label="Captura de cartas">
          <div className="scanner-camera-panel__heading"><h2>Pasa las cartas</h2><span>{drafts.length} en revisión</span></div>
          <p className="scanner-batch-summary">{printingLabel} · {condition}{owned.selected ? ` · ${owned.selected.name}` : ''}</p>
          <ScannerCamera running={running} onFrame={readFrame} onStop={pause} />
          <div className="scanner-actions scanner-session-actions">
            {running
              ? <button type="button" className="collections-page__btn" onClick={() => pause()}><Pause size={18} />Pausar</button>
              : <button type="button" className="collections-page__btn collections-page__btn--primary" disabled={!canStart || working} onClick={start}><Play size={18} />{drafts.length ? 'Continuar' : 'Iniciar escaneo'}</button>}
            <button type="button" className="collections-page__btn" disabled={working || reviewSaving || !drafts.length} onClick={() => {
              gate.current.rearm(); setStatus('Lista para otra copia de la misma carta.');
            }}>Otra copia igual</button>
          </div>
          <p className="scanner-live-status" role="status" aria-live="polite">{status}</p>
          {progress && <p className="scanner-progress">{progress}</p>}
          {!canStart && !running && <button type="button" className="collections-page__btn scanner-camera-configure" onClick={() => showStep('setup')}>Ver selección del catálogo</button>}
          <button type="button" className="collections-page__btn scanner-open-review" disabled={!drafts.length || reviewSaving} onClick={() => showStep('review')}><ListChecks size={18} aria-hidden="true" />Revisar {drafts.length} pendientes</button>
          <details className="scanner-help"><summary>Consejos y texto leído</summary>
            <p>Mantén cada carta quieta hasta ver «Enviada a revisión» y pasa a la siguiente. Las lecturas dudosas quedan señaladas para corregirlas.</p>
            <p>Una carta quieta no se cuenta dos veces. Para copias idénticas consecutivas, pulsa «Otra copia igual» entre ellas.</p>
            <p className="scanner-privacy">OCR local en inglés y español. Las fotos no se envían al servidor. La revisión se respalda en este navegador. Sólo el guardado confirmado requiere conexión.</p>
            {lastText && <pre className="scanner-read-text">{lastText}</pre>}
          </details>
          {error && <p className="scanner-error" role="alert">{error}</p>}
          {owned.error && <p className="scanner-error" role="alert">{owned.error}</p>}
        </section>
        <ScannerReview entries={drafts} setEntries={setDrafts} scanning={running || working} onSavingChange={setReviewSaving} />
      </div>
      {storageError && <p role="alert" className="scanner-error">{storageError}</p>}
      {guestDraftCount > 0 && <button type="button" className="collections-page__btn" disabled={locked} onClick={() => {
        try {
          const guest = readScannerReview(localStorage, '').map(entry => ({ ...entry, id: crypto.randomUUID(), collectionId: '', approved: false }));
          setDrafts(current => [...guest, ...current]); saveScannerReview(localStorage, '', []); setGuestDraftCount(0);
        } catch { setStorageError('No se pudo importar la revisión de invitado.'); }
      }}>Importar {guestDraftCount} pendientes escaneadas sin sesión</button>}
    </main>
  </div>;
}

