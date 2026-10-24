import { ListChecks, Pause, Play, ScanLine, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCardContext } from '../../context/CardContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import { loadHierarchy } from '../../services/cards';
import { createCardOcr } from '../../services/cardOcr';
import { COLLECTION_PRINTING_ORDER } from '../../services/inventory';
import { generateCardsForSeries } from '../../services/runtimeCards';
import { readScannerReview, saveScannerReview } from '../../services/scannerReview';
import type { Card, ConditionKey } from '../../types/dashboard';
import type { HierarchySerie } from '../../types/source-card';
import { automaticScanMatch, BASE_GYM_SCAN_SCOPE, cardsInScanScope, createScanGate, groupScanCards, rankScanMatches, scanScopeError, scanScopeFromFilters, type ScanDraft, type ScanScope } from '../../utils/cardScanner';
import { orderHierarchy } from '../../utils/hierarchy';
import { navigate } from '../../utils/route';
import { parseUrlParams } from '../../utils/urlParams';
import { ScannerCamera } from '../scanner/ScannerCamera';
import { ScannerReview } from '../scanner/ScannerReview';
import './scanner.css';

const CONDITIONS: ConditionKey[] = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];
type ScannerStep = 'setup' | 'camera' | 'review';

export function ScannerPage() {
  const { session } = useAuth();
  const { seriesSelection, selectedSets } = useCardContext();
  const owned = useOwnedCollections();
  const [scope, setScope] = useState<ScanScope>(() => scanScopeFromFilters(parseUrlParams()));
  const [scopeLink, setScopeLink] = useState('');
  const [hierarchy, setHierarchy] = useState<HierarchySerie[] | null>(null);
  const [catalog, setCatalog] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [printing, setPrinting] = useState('');
  const [condition, setCondition] = useState<ConditionKey>('Near Mint');
  const [running, setRunning] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState('');
  const [status, setStatus] = useState('Configura la sesión y pulsa Iniciar escaneo. Las cartas pasarán a revisión.');
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

  useEffect(() => {
    let cancelled = false;
    loadHierarchy().then(value => {
      if (!cancelled) setHierarchy(orderHierarchy(value));
    }).catch(() => { if (!cancelled) { setLoadError('No se pudieron cargar las series. Revisa tu conexión y vuelve a intentar.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [retry]);

  const seriesKey = JSON.stringify(scope.series);
  useEffect(() => {
    if (!hierarchy) return;
    let cancelled = false;
    const names: string[] = JSON.parse(seriesKey);
    const series = hierarchy.filter(serie => names.includes(serie.name));
    setCatalog([]); setLoadError('');
    if (!series.length) { setLoading(false); return; }
    setLoading(true);
    Promise.all(series.map(serie => generateCardsForSeries(serie.id))).then(responses => {
      if (!cancelled) setCatalog([...new Map(responses.flatMap(response => response.items).map(card => [card.id, card])).values()]);
    }).catch(() => {
      if (!cancelled) setLoadError('No se pudo cargar todo el rango. Revisa la conexión y vuelve a intentar.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hierarchy, seriesKey, retry]);

  const scopedCards = useMemo(() => cardsInScanScope(catalog, scope), [catalog, scope]);
  const printings = useMemo(() => {
    const values = [...new Set(scopedCards.map(card => card.printing || card.variant).filter(Boolean))];
    const rank = (value: string) => { const index = (COLLECTION_PRINTING_ORDER as readonly string[]).indexOf(value); return index < 0 ? 999 : index; };
    return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [scopedCards]);
  const scanCards = useMemo(() => scopedCards.filter(card => (card.printing || card.variant) === printing), [scopedCards, printing]);
  const count = useMemo(() => groupScanCards(scanCards).length, [scanCards]);
  const scopeError = scanScopeError(scope);
  const locked = running || working || reviewSaving;
  const canStart = Boolean(printing && count && !loading && !loadError && !scopeError && !reviewSaving);
  const scopeOptions = useMemo(() => cardsInScanScope(catalog, { ...scope, rarities: [], topLevelVariants: [], variants: [] }), [catalog, scope]);

  useEffect(() => {
    if (running && !canStart) {
      active.current = false;
      setRunning(false);
      setStatus('Sesión pausada: revisa el rango y la impresión del lote.');
    }
  }, [running, canStart]);

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
    const signature = JSON.stringify([session?.user.id, owned.selectedId, printing, condition, scope]);
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
        setStatus('Buscando carta dentro del rango…');
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
        <p>Configura el lote una vez y pasa las cartas frente a la cámara. Se acumulan en revisión; sólo las confirmadas se añaden a tu colección.</p>
      </div>
      <nav className="scanner-step-nav" aria-label="Pasos del escáner">
        <button type="button" aria-pressed={mobileStep === 'setup'} disabled={reviewSaving} onClick={() => showStep('setup')}><SlidersHorizontal size={18} aria-hidden="true" /><span>Configurar</span></button>
        <button type="button" aria-pressed={mobileStep === 'camera'} disabled={reviewSaving} onClick={() => showStep('camera')}><ScanLine size={18} aria-hidden="true" /><span>Escanear</span>{running && <span className="scanner-live-dot" aria-label="Video activo" />}</button>
        <button type="button" aria-pressed={mobileStep === 'review'} onClick={() => showStep('review')}><ListChecks size={18} aria-hidden="true" /><span>Revisar</span><span className="scanner-step-count">{drafts.length}</span></button>
      </nav>
      <div className="scanner-setup">
      <section className="scanner-panel">
        <h2>1. Rango de cartas</h2>
        <fieldset disabled={locked} className="scanner-scope">
          <legend className="scanner-sr-only">Series, sets y números permitidos</legend>
          <div className="scanner-actions">
            <button type="button" className="collections-page__btn" onClick={() => setScope({ ...BASE_GYM_SCAN_SCOPE })}>Base + Gym · Common / Uncommon / Rare · Standard</button>
            <button type="button" className="collections-page__btn" onClick={() => setScope({ ...scanScopeFromFilters(parseUrlParams()), series: seriesSelection.included.filter(name => !seriesSelection.excluded.includes(name)), sets: selectedSets })}>Usar selección del catálogo</button>
          </div>
          <label>Importar filtros de un enlace del catálogo<input type="url" placeholder="Pega aquí tu enlace con sets, rarezas y variantes" value={scopeLink} onChange={event => setScopeLink(event.target.value)} /></label>
          <button type="button" className="collections-page__btn" disabled={!scopeLink.trim()} onClick={() => {
            try { setScope(scanScopeFromFilters(parseUrlParams(new URL(scopeLink, window.location.origin).search))); setError(''); }
            catch { setError('El enlace del catálogo no es válido.'); }
          }}>Aplicar filtros del enlace</button>
          {!hierarchy && !loadError && <p role="status">Cargando series…</p>}
          <div className="scanner-series" role="group" aria-label="Eras permitidas">
            {hierarchy?.map(serie => <label key={serie.id}>
              <input type="checkbox" checked={scope.series.includes(serie.name)} onChange={event => {
                const series = event.target.checked ? [...scope.series, serie.name] : scope.series.filter(name => name !== serie.name);
                const allowedSets = hierarchy.filter(entry => series.includes(entry.name)).flatMap(entry => entry.sets.map(set => set.name));
                setScope({ ...scope, series, sets: scope.sets.filter(name => allowedSets.includes(name)) });
              }} />{serie.name}
            </label>)}
          </div>
          <details className="scanner-sets">
            <summary>Limitar a sets concretos {scope.sets.length ? `(${scope.sets.length})` : '(todos los de las eras elegidas)'}</summary>
            <button type="button" className="collections-page__btn" onClick={() => setScope({ ...scope, sets: [] })}>Incluir todos los sets de estas eras</button>
            {hierarchy?.filter(serie => scope.series.includes(serie.name)).map(serie => <div key={serie.id}>
              <strong>{serie.name}</strong>
              {serie.sets.map(set => <label key={set.id}><input type="checkbox" checked={scope.sets.includes(set.name)} onChange={event => setScope({ ...scope, sets: event.target.checked ? [...scope.sets, set.name] : scope.sets.filter(name => name !== set.name) })} />{set.name}</label>)}
            </div>)}
          </details>
          <ScopeChoices title="Rarezas" options={[...new Set(scopeOptions.flatMap(card => card.rarities?.length ? card.rarities : [card.rarity]).filter(Boolean))].sort()} selected={scope.rarities ?? []} onChange={rarities => setScope({ ...scope, rarities })} />
          <ScopeChoices title="Tipos de variante" options={[...new Set(scopeOptions.map(card => card.cardVariantTopLevel || card.variant).filter(Boolean))].sort()} selected={scope.topLevelVariants ?? []} onChange={topLevelVariants => setScope({ ...scope, topLevelVariants })} />
          <ScopeChoices title="Variantes específicas" options={[...new Set(scopeOptions.filter(card => !scope.topLevelVariants?.length || scope.topLevelVariants.includes(card.cardVariantTopLevel || card.variant)).map(card => card.variant).filter(Boolean))].sort()} selected={scope.variants ?? []} onChange={variants => setScope({ ...scope, variants })} />
          <div className="scanner-range">
            <label>Número desde<input inputMode="numeric" placeholder="Sin límite" value={scope.min} onChange={event => setScope({ ...scope, min: event.target.value })} /></label>
            <label>Número hasta<input inputMode="numeric" placeholder="Sin límite" value={scope.max} onChange={event => setScope({ ...scope, max: event.target.value })} /></label>
          </div>
          <small>El rango numérico se aplica dentro de cada set. Vacío incluye también números con prefijos, como TG o SV.</small>
        </fieldset>
        {scopeError && <p role="alert" className="scanner-error">{scopeError}</p>}
        {loadError && <p className="scanner-error" role="alert">{loadError} <button type="button" className="collections-page__btn" disabled={locked} onClick={() => setRetry(value => value + 1)}>Reintentar</button></p>}
      </section>
      <section className="scanner-panel">
        <h2>2. Configurar el lote</h2>
        <fieldset disabled={locked} className="scanner-scope scanner-batch">
          <legend className="scanner-sr-only">Destino y atributos de todas las copias del lote</legend>
          <label>Colección de destino<select value={owned.selected?.id ?? ''} disabled={!owned.synced} onChange={event => owned.setSelectedId(event.target.value)}>
            <option value="">Selecciona tu colección</option>
            {owned.collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select></label>
          <label>Impresión<select value={printings.includes(printing) ? printing : ''} onChange={event => setPrinting(event.target.value)}>
            <option value="">Selecciona la impresión del lote</option>
            {printings.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label>Estado<select value={condition} onChange={event => setCondition(event.target.value as ConditionKey)}>
            {CONDITIONS.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
        </fieldset>
        <p className="scanner-count" role="status">{loading ? 'Cargando cartas del rango…' : `${count} cartas elegibles con esta impresión`}</p>
        {!session && <p>Puedes escanear a revisión sin iniciar sesión. <button type="button" className="collections-page__btn" onClick={() => navigate('collections')}>Inicia sesión para elegir una colección</button></p>}
        {session && !owned.collections.length && <p>Crea una colección editable o una subcolección. <button type="button" className="collections-page__btn" onClick={() => navigate('collections')}>Ir a colecciones</button></p>}
        <small>Estos ajustes se aplican a cada copia nueva. Pausa el video para cambiar de lote.</small>
        <button type="button" className="collections-page__btn collections-page__btn--primary scanner-setup-start" disabled={!canStart || locked} onClick={start}><ScanLine size={18} aria-hidden="true" />Abrir cámara y empezar</button>
      </section>
      </div>
      <div className="scanner-columns">
        <section ref={cameraPanelRef} className="scanner-panel scanner-camera-panel" aria-label="Captura de cartas">
          <div className="scanner-camera-panel__heading"><h2>Pasa las cartas</h2><span>{drafts.length} en revisión</span></div>
          <p className="scanner-batch-summary">{printing || 'Sin impresión'} · {condition}{owned.selected ? ` · ${owned.selected.name}` : ''}</p>
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
          {!canStart && !running && <button type="button" className="collections-page__btn scanner-camera-configure" onClick={() => showStep('setup')}>Configura el rango y la impresión para empezar</button>}
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

function ScopeChoices({ title, options, selected, onChange }: { title: string; options: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  const values = [...new Set([...selected, ...options])];
  return <details className="scanner-sets" open={selected.length > 0}>
    <summary>{title}: {selected.length ? selected.join(', ') : 'Todas'}</summary>
    <button type="button" className="collections-page__btn" onClick={() => onChange([])}>Incluir todas</button>
    <div>{values.map(value => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={event => onChange(event.target.checked ? [...selected, value] : selected.filter(entry => entry !== value))} />{value}</label>)}</div>
  </details>;
}
