import { BookOpen, Check, Image as ImageIcon, LayoutGrid, ListChecks, Pause, Play, Plus, RefreshCw, ScanLine, SearchCheck, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCardContext } from '../../context/CardContext';
import { useOptionsContext } from '../../context/OptionsContext';
import { useOwnedCollections } from '../../context/OwnedCollectionsContext';
import { createCardOcr } from '../../services/cardOcr';
import { createCardEmbedder, loadCardVectors } from '../../services/cardVectors';
import { COLLECTION_PRINTING_ORDER, loadInventory, type InventoryEntry, type InventorySnapshot } from '../../services/inventory';
import { readScannerReview, saveScannerReview } from '../../services/scannerReview';
import type { Card, ConditionKey } from '../../types/dashboard';
import { locateAndCropCard } from '../../utils/cardDetection';
import { automaticScanMatch, createScanGate, defaultDraftCardId, draftQuantity, groupScanCards, proposedScanCard, rankScanMatches, scanPrinting, withDraftQuantity, type ScanDraft, type ScanMatch } from '../../utils/cardScanner';
import { rankVisualMatches, vectorSimilarity, type CardVectorIndex, type VisualMatch } from '../../utils/visualMatch';
import { collectionScopeNames } from '../../utils/collectionTree';
import { money } from '../../utils/reportDisplay';
import { scannerCatalogCards } from '../../utils/scannerCatalog';
import { cardsByProduct, checkCollectionGroups, checkPriceAlert, checkScan, checkStatusText, DEFAULT_CHECK_SETTINGS, ocrCheckCandidates, parsePriceLimit, priceAlertText, readCheckSettings, saveCheckSettings, visualCheckCandidates, type CheckResult, type PriceAlert, type ScannerCheckSettings } from '../../utils/scannerCheck';
import { playScanSound, primeScanSound, scanSoundEnabled, setScanSoundEnabled } from '../../utils/scanSound';
import { readTableMode, saveTableMode } from '../../utils/tableScan';
import { navigate, openCardsView } from '../../utils/route';
import { parseUrlParams } from '../../utils/urlParams';
import { CATALOG_VIEW } from '../../utils/viewMode';
import { ScannerCamera } from '../scanner/ScannerCamera';
import { ScannerCheckResult } from '../scanner/ScannerCheckResult';
import { ScannerReview } from '../scanner/ScannerReview';
import { ScannerTable } from '../scanner/ScannerTable';
import './scanner.css';

const CONDITIONS: ConditionKey[] = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];
type ScannerStep = 'setup' | 'camera' | 'review';
const ADD_READY_STATUS = 'Lista para escanear la selección del catálogo. Las cartas pasarán a revisión.';
const CHECK_READY_STATUS = 'Lista para comprobar. No se guarda nada ni se envía a revisión.';
const NO_ENTRIES: ReadonlyMap<number, InventoryEntry[]> = new Map();

export function ScannerPage({ catalogLoading = false, catalogError }: { catalogLoading?: boolean; catalogError?: string | null }) {
  const { session, inventoryRevision, inventoryPatchTick, refreshInventory } = useAuth();
  const { allCards, renderCards, seriesSelection, selectedSets, activeFilterChips, viewMode, setViewMode, priceRange, collectionFilter, pokemonGrouping } = useCardContext();
  const { collections } = useOptionsContext();
  const owned = useOwnedCollections();
  const [checkSettings, setCheckSettings] = useState<ScannerCheckSettings>(() => {
    try { return readCheckSettings(localStorage); } catch { return DEFAULT_CHECK_SETTINGS; }
  });
  const checking = checkSettings.checking;
  const [tableMode, setTableMode] = useState(() => { try { return readTableMode(localStorage); } catch { return false; } });
  const [printing, setPrinting] = useState('');
  const [condition, setCondition] = useState<ConditionKey>('Near Mint');
  const [running, setRunning] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState('');
  const [status, setStatus] = useState(checking ? CHECK_READY_STATUS : ADD_READY_STATUS);
  const [error, setError] = useState('');
  const ownerId = session?.user.id ?? '';
  const [restoredReview] = useState(() => {
    try { return { entries: readScannerReview(localStorage, ownerId), available: true }; }
    catch { return { entries: [] as ScanDraft[], available: false }; }
  });
  const [drafts, setDrafts] = useState(restoredReview.entries);
  const [mobileStep, setMobileStep] = useState<ScannerStep>(restoredReview.entries.length && !checking ? 'review' : 'setup');
  const [reviewSaving, setReviewSaving] = useState(false);
  const [storageError, setStorageError] = useState(restoredReview.available ? '' : 'No se pudo leer la revisión guardada. La revisión nueva sólo estará disponible mientras esta página siga abierta.');
  const [guestDraftCount, setGuestDraftCount] = useState(() => {
    try { return ownerId ? readScannerReview(localStorage, '').length : 0; } catch { return 0; }
  });
  const [lastText, setLastText] = useState('');
  const [soundOn, setSoundOn] = useState(scanSoundEnabled);
  /** The card being read, shown over the video so it is visible without scrolling. */
  const [live, setLive] = useState<{ card: Card; detail: string; sent: boolean; check?: { result: CheckResult; alert: PriceAlert | null } } | null>(null);
  /** Check mode reads the snapshot directly: the catalog only loads it when a filter needs it. */
  const [inventory, setInventory] = useState<{ snapshot: InventorySnapshot | null; failed: boolean }>({ snapshot: null, failed: false });
  const inventoryRevisionSeen = useRef(inventoryRevision);
  const announced = useRef(new Set<string>());
  const ocrRef = useRef<ReturnType<typeof createCardOcr> | null>(null);
  const embedderRef = useRef<ReturnType<typeof createCardEmbedder> | null>(null);
  const [vectors, setVectors] = useState<{ key: string; index: CardVectorIndex | null } | null>(null);
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
      embedderRef.current?.dispose(); embedderRef.current = null;
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
    try { saveCheckSettings(localStorage, checkSettings); } catch { /* the choice lasts this visit only */ }
  }, [checkSettings]);

  useEffect(() => {
    try { saveTableMode(localStorage, tableMode); } catch { /* the choice lasts this visit only */ }
  }, [tableMode]);

  useEffect(() => {
    if (!checking || !ownerId) return;
    let cancelled = false;
    // A revision bump means something changed, and Main only reloads when a filter needs it.
    const forceRefresh = inventoryRevision !== inventoryRevisionSeen.current;
    setInventory(current => ({ ...current, failed: false }));
    loadInventory({ userId: ownerId, forceRefresh }).then(snapshot => {
      if (cancelled) return;
      inventoryRevisionSeen.current = inventoryRevision;
      setInventory({ snapshot, failed: false });
    }).catch(() => {
      if (!cancelled) setInventory(current => ({ ...current, failed: true }));
    });
    return () => { cancelled = true; };
  }, [checking, ownerId, inventoryRevision, inventoryPatchTick]);

  const scopedCards = useMemo(() => scannerCatalogCards(renderCards), [renderCards]);
  /** Every printing of each product, so a copy of a filtered-out printing is not counted. */
  const catalogByProduct = useMemo(() => cardsByProduct(allCards), [allCards]);
  const printings = useMemo(() => {
    const values = [...new Set(scopedCards.map(scanPrinting).filter(Boolean))];
    const rank = (value: string) => { const index = (COLLECTION_PRINTING_ORDER as readonly string[]).indexOf(value); return index < 0 ? 999 : index; };
    return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }, [scopedCards]);
  const scanCards = useMemo(() => printing ? scopedCards.filter(card => scanPrinting(card) === printing) : scopedCards, [scopedCards, printing]);
  const count = useMemo(() => groupScanCards(scanCards).length, [scanCards]);
  const seriesKey = useMemo(() => JSON.stringify([...new Set(scopedCards.flatMap(card => card.setSeriesNames?.length ? card.setSeriesNames : [card.setSeries]).filter(Boolean))].sort()), [scopedCards]);
  useEffect(() => {
    let cancelled = false;
    loadCardVectors(JSON.parse(seriesKey)).then(index => { if (!cancelled) setVectors({ key: seriesKey, index }); });
    return () => { cancelled = true; };
  }, [seriesKey]);
  const vectorIndex = vectors?.key === seriesKey ? vectors.index : null;
  const visualCount = useMemo(() => vectorIndex ? groupScanCards(scanCards).filter(group => group.cards.some(card => vectorIndex.rows.has(card.image))).length : 0, [scanCards, vectorIndex]);
  const catalogSignature = useMemo(() => JSON.stringify(scopedCards.map(card => [card.id, card.printing || card.variant]).sort()), [scopedCards]);
  const checkGroups = useMemo(() => checkCollectionGroups(collections), [collections]);
  const checkCollection = collections.some(collection => collection.name === checkSettings.collection) ? checkSettings.collection : '';
  const checkScope = useMemo(() => new Set(checkCollection ? collectionScopeNames(collections, checkCollection) : []), [collections, checkCollection]);
  const priceLimit = parsePriceLimit(checkSettings.limit);
  const priceLimitInvalid = Number.isNaN(priceLimit);
  /**
   * A selection made out of what a collection holds cannot be checked against it: a card it
   * leaves out would pass as its closest look-alike, and every card would seem to be there.
   */
  const viewingCollection = viewMode.kind === 'collection';
  const checkBlockedBySelection = checking && (viewingCollection || (collectionFilter.enabled && collectionFilter.mode !== 'none') ||
    (pokemonGrouping.enabled && pokemonGrouping.filterByCollection !== 'all'));
  const checkReady = Boolean(checkCollection && inventory.snapshot && !checkBlockedBySelection && !priceLimitInvalid);
  const locked = running || working || reviewSaving;
  const canStart = Boolean(count && !catalogLoading && !catalogError && !reviewSaving && (!checking || checkReady));
  const signature = JSON.stringify([session?.user.id, owned.selectedId, printing, condition, catalogSignature, checking, checkCollection, priceLimit, tableMode]);
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
    if (running && (!canStart || sessionSignature.current !== signature)) {
      active.current = false; generation.current++;
      setRunning(false);
      setStatus('Sesión pausada: cambió la selección del catálogo o el lote.');
    }
  }, [running, canStart, signature]);

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
    // Audio is only allowed after a tap, so the chime is unlocked here.
    primeScanSound();
    if (signature !== sessionSignature.current) {
      gate.current.rearm();
      sessionSignature.current = signature;
    }
    generation.current++;
    setMobileStep('camera');
    active.current = true; setRunning(true); setError(''); setLive(null); setStatus('Abriendo cámara…');
    // Scroll after the mobile pane is visible. On desktop, bring the camera into view.
    window.requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 900px)').matches) pageRef.current?.scrollTo({ top: 0 });
      else cameraPanelRef.current?.scrollIntoView({ block: 'start' });
      cameraPanelRef.current?.querySelector<HTMLButtonElement>('.scanner-session-actions button')?.focus({ preventScroll: true });
    });
  };

  const setChecking = (next: boolean) => {
    setCheckSettings(current => ({ ...current, checking: next }));
    setLive(null);
    setStatus(next ? CHECK_READY_STATUS : ADD_READY_STATUS);
    setMobileStep(step => step === 'review' && next ? 'setup' : step);
  };

  const readFrame = async (image: HTMLCanvasElement) => {
    if (!active.current || processing.current || !canStart) return;
    const current = generation.current;
    processing.current = true; setWorking(true);
    try {
      const isStale = () => !mounted.current || !active.current || current !== generation.current;
      const report = (message: string) => { if (mounted.current && active.current) setProgress(message); };
      ocrRef.current ??= createCardOcr(report);
      const located = locateAndCropCard(image);
      let text = { name: '', number: '', detected: located.detected };
      let visual: VisualMatch | null = null;
      if (vectorIndex && visualCount) {
        // The image identifies the card; OCR only has to read its collector number.
        embedderRef.current ??= createCardEmbedder(vectorIndex.model, report);
        const query = await embedderRef.current.embed(located.detected ? located.canvas : image);
        if (isStale()) return;
        const similarity = (card: Card) => { const row = vectorIndex.rows.get(card.image); return row ? vectorSimilarity(query, row) : undefined; };
        if (rankVisualMatches(scanCards, similarity, '')) {
          text = await ocrRef.current.recognize(image, { located, numberOnly: true });
          visual = rankVisualMatches(scanCards, similarity, text.number);
          // Without a readable number, the name tells look-alikes apart (Oddish, Erika's Oddish).
          if (visual && visual.resolvedBy !== 'number' && !isStale()) {
            const name = (await ocrRef.current.recognize(image, { located, nameOnly: true })).name;
            text = { ...text, name };
            visual = rankVisualMatches(scanCards, similarity, text.number, name);
          }
        }
      }
      // Cards without image data, or a frame the image model does not recognise, fall back to OCR.
      if (!visual) text = await ocrRef.current.recognize(image, { located });
      if (isStale()) return;
      setProgress('');

      /** `keys` are in order of likelihood; review lists the candidates the same way. */
      const stage = (gateKey: string, latchKeys: string[], shown: Card, detail: string, keys: string[], preferredId: string | undefined, note: string) => {
        const name = shown.name;
        const stable = gate.current.observe(gateKey);
        if (gate.current.isLatched(gateKey)) { setLive({ card: shown, detail, sent: true }); setStatus(`${name} enviada a revisión. Pasa la siguiente carta.`); return; }
        if (!stable) { setLive({ card: shown, detail, sent: false }); setStatus(`${name} detectada. Mantenla quieta para confirmar la lectura…`); return; }
        const groups = new Map(groupScanCards(scopedCards).map(group => [group.key, group.cards]));
        const candidates = [...new Set(keys)].flatMap(key => groups.get(key) ?? []);
        const draft: ScanDraft = {
          id: crypto.randomUUID(), candidates, cardId: defaultDraftCardId(candidates, preferredId), condition,
          collectionId: owned.selected?.id ?? '', approved: false, note, createdAt: new Date().toISOString(),
        };
        gate.current.commit(gateKey, ...latchKeys);
        setDrafts(entries => [draft, ...entries]);
        setLive({ card: shown, detail, sent: true });
        if (active.current) setStatus(`${name} enviada a revisión. Pasa la siguiente carta.`);
        if (active.current) { navigator.vibrate?.(80); playScanSound(); }
      };

      /** `openEnded` lists may leave the real card out, so they never settle an answer. */
      const answer = (gateKey: string, latchKeys: string[], groups: ScanMatch[], openEnded = false) => {
        const result = checkScan(groups, inventory.snapshot?.entriesByProductId ?? new Map(), checkScope, { openEnded, catalogByProduct });
        const shown = result.candidates[0].card;
        if (gate.current.observe(gateKey)) { gate.current.commit(gateKey, ...latchKeys); announced.current.clear(); }
        else if (!gate.current.isLatched(gateKey)) {
          setLive({ card: shown, detail: `Comprobando en ${checkCollection}`, sent: false });
          setStatus(`${shown.name} detectada. Mantenla quieta para confirmar la lectura…`);
          return;
        }
        const alert = checkPriceAlert(groups, priceLimit);
        setLive({ card: shown, detail: '', sent: true, check: { result, alert } });
        const warning = alert && priceLimit !== null ? `${priceAlertText(alert, priceLimit)}. ` : '';
        setStatus(`${warning}${checkStatusText(result, checkCollection)}`);
        // Each sound once per card, however many frames repeat it. A better read of the same
        // card can still add one, as when the number settles a doubtful first answer.
        const pricey = alert && alert.level !== 'unpriced';
        const tone = pricey ? 'alert' : result.verdict === 'held' ? 'confirm' : result.verdict === 'absent' ? 'missing' : null;
        if (tone && !announced.current.has(tone) && active.current) {
          announced.current.add(tone);
          navigator.vibrate?.(pricey ? [120, 60, 120] : 80);
          playScanSound(tone);
        }
      };

      if (visual) {
        const top = visual.resolved ?? visual.shortlist[0];
        setLastText(`Imagen: ${visual.shortlist.map(group => `${group.cards[0].name} · ${group.cards[0].setName} ${Math.round(group.similarity * 100)}%`).join(', ')}\n${text.name}\n${text.number}`.trim());
        if (checking) { answer(visual.gateKey, visual.latchKeys, visualCheckCandidates(visual, text.number)); return; }
        const proposed = visual.resolved ? proposedScanCard(visual.resolved.cards) : null;
        const printingNote = visual.resolved && visual.resolved.cards.length > 1 ? ' Revisa la impresión (1st Edition no se distingue por cámara).' : '';
        const shown = proposed ?? top.cards[0];
        const sets = new Set(visual.shortlist.map(group => group.cards[0].setName)).size;
        stage(visual.gateKey, visual.latchKeys, shown, visual.resolved ? `${shown.setName} · ${shown.number}` : `${sets} sets posibles · elige en revisión`, [top, ...visual.shortlist, ...visual.related].map(group => group.key),
          proposed?.id,
          visual.resolvedBy === 'number' ? `La imagen y el número coinciden.${printingNote}`
            : visual.resolvedBy === 'name' ? `La imagen y el nombre coinciden; no se leyó el número.${printingNote}`
            : visual.resolvedBy === 'image' ? `Reconocida por la imagen; no se leyó el número.${printingNote}`
              : 'La ilustración coincide con varios sets y no se leyó el número: elige el correcto.');
        return;
      }

      setLastText(`${text.name}\n${text.number}`.trim());
      const matches = rankScanMatches(scanCards, text.name, text.number);
      const certain = automaticScanMatch(matches);
      const match = matches[0];
      if (!match) {
        gate.current.observe(null);
        setLive(null);
        setStatus(text.detected ? `Leyendo carta entre las ${count} del catálogo… Mantén la carta quieta y enfocada.` : 'Acerca la carta y deja visibles sus cuatro bordes. Evita los reflejos.');
        return;
      }
      if (checking) {
        const { groups, openEnded } = ocrCheckCandidates(matches);
        answer(match.key, [], groups, openEnded);
        return;
      }
      stage(match.key, [], certain?.card ?? match.cards[0], certain ? `${certain.card.setName} · ${certain.card.number}` : 'Lectura dudosa · elige en revisión', matches.slice(0, 6).map(candidate => candidate.key), certain?.card.id,
        certain ? 'Nombre y número coinciden. Pendiente de revisión.' : 'Lectura dudosa: elige la carta y la impresión correctas.');
    } catch {
      if (mounted.current && active.current && current === generation.current) {
        setError('No se pudo leer la carta. Revisa la conexión para descargar el reconocimiento (sólo la primera vez) e inténtalo otra vez.');
        pause('Sesión pausada por un error de lectura.');
        ocrRef.current?.dispose(); ocrRef.current = null;
        embedderRef.current?.dispose(); embedderRef.current = null;
      }
    } finally {
      processing.current = false;
      if (mounted.current) { setWorking(false); setProgress(''); }
    }
  };

  const batchSummary = checking
    ? `${checkCollection ? `Comprobando en ${checkCollection}` : 'Elige una colección'} · ${printingLabel}${priceLimit !== null && !priceLimitInvalid ? ` · Aviso si supera ${money(priceLimit)}` : ''}`
    : `${printingLabel} · ${condition}${owned.selected ? ` · ${owned.selected.name}` : ''}`;

  const printingSelect = <label>Impresión<select value={printing} onChange={event => setPrinting(event.target.value)}>
    <option value="">Usar catálogo{printings.length === 1 ? ` · ${printings[0]}` : ''}</option>
    {printing && !printings.includes(printing) && <option value={printing}>{printing} · fuera de la selección</option>}
    {printings.map(value => <option key={value} value={value}>{value}</option>)}
  </select></label>;

  return <div ref={pageRef} className={`collections-page scanner-page scanner-step--${mobileStep}${running ? ' scanner-page--running' : ''}${checking ? ' scanner-page--check' : ''}`}>
    <main className="collections-page__body">
      <div className="collections-page__intro">
        <h1><ScanLine size={26} aria-hidden="true" /> Escaneo continuo</h1>
        <p>{checking
          ? 'Pasa las cartas frente a la cámara y mira si ya están en la colección que elijas. Sólo se consulta: no se guarda nada.'
          : 'Usa las cartas que tienes filtradas en el catálogo y pásalas frente a la cámara. Se acumulan en revisión; sólo las confirmadas se añaden a tu colección.'}</p>
      </div>
      <nav className="scanner-step-nav" aria-label="Pasos del escáner">
        <button type="button" aria-pressed={mobileStep === 'setup'} disabled={reviewSaving} onClick={() => showStep('setup')}><BookOpen size={18} aria-hidden="true" /><span>{checking ? 'Ajustes' : 'Catálogo'}</span></button>
        <button type="button" aria-pressed={mobileStep === 'camera'} disabled={reviewSaving} onClick={() => showStep('camera')}><ScanLine size={18} aria-hidden="true" /><span>Escanear</span>{running && <span className="scanner-live-dot" aria-label="Video activo" />}</button>
        {!checking && <button type="button" aria-pressed={mobileStep === 'review'} onClick={() => showStep('review')}><ListChecks size={18} aria-hidden="true" /><span>Revisar</span><span className="scanner-step-count">{drafts.length}</span></button>}
      </nav>
      <div className="scanner-setup">
      <div className="scanner-mode" role="group" aria-label="Qué hacer con cada carta">
        <button type="button" className="collections-page__btn" aria-pressed={!checking} disabled={locked} onClick={() => setChecking(false)}><Plus size={18} aria-hidden="true" />Añadir a colección{drafts.length ? ` (${drafts.length} en revisión)` : ''}</button>
        <button type="button" className="collections-page__btn" aria-pressed={checking} disabled={locked} onClick={() => setChecking(true)}><SearchCheck size={18} aria-hidden="true" />Comprobar si ya la tengo</button>
      </div>
      <div className="scanner-mode" role="group" aria-label="Cómo capturar las cartas">
        <button type="button" className="collections-page__btn" aria-pressed={!tableMode} disabled={locked} onClick={() => setTableMode(false)}><ScanLine size={18} aria-hidden="true" />Una a una con video</button>
        <button type="button" className="collections-page__btn" aria-pressed={tableMode} disabled={locked} onClick={() => setTableMode(true)}><LayoutGrid size={18} aria-hidden="true" />Varias en la mesa</button>
      </div>
      <section className="scanner-panel scanner-catalog" aria-label="Selección del catálogo">
        <div className="scanner-catalog__heading"><h2><BookOpen size={20} aria-hidden="true" /> Selección del catálogo</h2><span className="scanner-catalog__sync"><Check size={14} aria-hidden="true" /> Sincronizada</span></div>
        <p className="scanner-catalog__count" role="status">{catalogLoading ? 'Cargando selección…' : `${groupScanCards(scopedCards).length} cartas para identificar`}</p>
        <p>{checking
          ? 'El escáner busca entre las mismas cartas que ves en el catálogo, y la respuesta cubre sólo esas variantes.'
          : 'El escáner busca entre las mismas cartas que ves en el catálogo.'}</p>
        {!catalogLoading && count > 0 && <p className="scanner-catalog__visual" role="status"><ImageIcon size={16} aria-hidden="true" />{
          !vectors || vectors.key !== seriesKey ? 'Comprobando reconocimiento por imagen…'
            : visualCount === count ? `Reconocimiento por imagen para las ${count} cartas. El OCR sólo lee el número para distinguir reimpresiones.`
              : visualCount ? `Reconocimiento por imagen para ${visualCount} de ${count} cartas; el resto se identifica por OCR del nombre y el número.`
                : 'Esta selección aún no tiene reconocimiento por imagen: se identifica por OCR del nombre y el número.'
        }</p>}
        <div className="scanner-catalog__chips" aria-label="Filtros heredados del catálogo">
          {sourceChips.map((label, index) => <span key={`${index}-${label}`}>{label}</span>)}
          {!sourceChips.length && <span>Todos los resultados del catálogo</span>}
        </div>
        {!checking && owned.selected && <p className="scanner-catalog__destination">Destino del catálogo: <strong>{owned.selected.name}</strong></p>}
        {catalogError && <p className="scanner-error" role="alert">{catalogError}</p>}
        {!catalogLoading && !catalogError && !scopedCards.length && <p role="status">No hay cartas en esta selección. Ajusta los filtros en el catálogo.</p>}
        {checkBlockedBySelection && <>
          <p className="scanner-error" role="alert">Esta selección sale de lo que tienen tus colecciones: las cartas parecerían estar o faltar sin que lo hayas comprobado. {viewingCollection ? 'Vuelve al catálogo general.' : 'Quita el filtro por colección en el catálogo.'}</p>
          {viewingCollection && <button type="button" className="collections-page__btn" disabled={locked} onClick={() => setViewMode(CATALOG_VIEW)}>Usar el catálogo general</button>}
        </>}
        <button type="button" className="collections-page__btn" disabled={locked} onClick={openCardsView}>Cambiar en el catálogo</button>
      </section>
      {checking ? <section className="scanner-panel">
        <h2>Qué comprobar</h2>
        <fieldset disabled={locked} className="scanner-scope scanner-batch">
          <legend className="scanner-sr-only">Colección, impresión y precio límite de la comprobación</legend>
          <label>Colección a comprobar<select value={checkCollection} disabled={!session} onChange={event => setCheckSettings(current => ({ ...current, collection: event.target.value }))}>
            <option value="">Selecciona una colección</option>
            {checkGroups.map(group => <optgroup key={group.label} label={group.label}>
              {group.options.map(option => <option key={option.name} value={option.name}>{option.label}</option>)}
            </optgroup>)}
          </select></label>
          {printingSelect}
          <label>Avisar si vale más de (USD, opcional)<input type="text" inputMode="decimal" autoComplete="off" placeholder="Sin aviso" aria-invalid={priceLimitInvalid} value={checkSettings.limit} onChange={event => setCheckSettings(current => ({ ...current, limit: event.target.value }))} /></label>
        </fieldset>
        <p className="scanner-count" role="status">{catalogLoading ? 'Cargando cartas…' : `${count} cartas con estos ajustes`}</p>
        {priceLimitInvalid && <p className="scanner-error" role="alert">Escribe el precio con números, por ejemplo 20 o 12,50.</p>}
        {!session && <p>Inicia sesión para comprobar tus colecciones. <button type="button" className="collections-page__btn" onClick={() => navigate('collections')}>Inicia sesión</button></p>}
        {session && !inventory.snapshot && !inventory.failed && <p role="status">Cargando tus colecciones…</p>}
        {inventory.failed && <p className="scanner-error" role="alert">{inventory.snapshot ? 'No se pudieron actualizar tus colecciones; se usa la última copia.' : 'No se pudieron cargar tus colecciones. Revisa la conexión.'}</p>}
        {inventory.snapshot?.fetchedAt && <p className="scanner-check-freshness"><span>Colecciones al {new Date(inventory.snapshot.fetchedAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <button type="button" className="collections-page__btn" disabled={locked} onClick={refreshInventory}><RefreshCw size={16} aria-hidden="true" />Actualizar</button></p>}
        <small>La respuesta cubre las impresiones de esta selección y lista cuáles tienes; si son varias, la cámara no distingue el sello de 1st Edition. El precio es el de Near Mint (o el mejor disponible); si alguna impresión posible supera el límite, avisa.</small>
        <button type="button" className="collections-page__btn collections-page__btn--primary scanner-setup-start" disabled={!canStart || locked} onClick={start}><SearchCheck size={18} aria-hidden="true" />Abrir cámara y comprobar</button>
      </section> : <section className="scanner-panel">
        <h2>Atributos de las copias</h2>
        <fieldset disabled={locked} className="scanner-scope scanner-batch">
          <legend className="scanner-sr-only">Destino y atributos de todas las copias del lote</legend>
          <label>Colección de destino<select value={owned.selected?.id ?? ''} disabled={!owned.synced} onChange={event => owned.setSelectedId(event.target.value)}>
            <option value="">Selecciona tu colección</option>
            {owned.collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select></label>
          {printingSelect}
          <label>Estado<select value={condition} onChange={event => setCondition(event.target.value as ConditionKey)}>
            {CONDITIONS.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
        </fieldset>
        <p className="scanner-count" role="status">{catalogLoading ? 'Cargando cartas…' : `${count} cartas con estos ajustes`}</p>
        {!session && <p>Puedes escanear a revisión sin iniciar sesión. <button type="button" className="collections-page__btn" onClick={() => navigate('collections')}>Inicia sesión para elegir una colección</button></p>}
        {session && !owned.collections.length && <p>Crea una colección editable o una subcolección. <button type="button" className="collections-page__btn" onClick={() => navigate('collections')}>Ir a colecciones</button></p>}
        <small>Estos ajustes se aplican a cada copia nueva. Pausa el video para cambiar de lote.</small>
        <button type="button" className="collections-page__btn collections-page__btn--primary scanner-setup-start" disabled={!canStart || locked} onClick={start}><ScanLine size={18} aria-hidden="true" />Abrir cámara y empezar</button>
      </section>}
      </div>
      <div className="scanner-columns">
        {tableMode ? <ScannerTable panelRef={cameraPanelRef} running={running} canStart={canStart} onStart={start} onStop={pause} summary={batchSummary}
          cards={scanCards} catalogCards={scopedCards} vectorIndex={vectorIndex} hasVisual={visualCount > 0}
          checking={checking} entriesByProductId={inventory.snapshot?.entriesByProductId ?? NO_ENTRIES} checkScope={checkScope} catalogByProduct={catalogByProduct}
          priceLimit={priceLimitInvalid ? null : priceLimit} condition={condition} collectionId={owned.selected?.id ?? ''}
          onStage={entries => setDrafts(current => [...entries, ...current])} /> : <section ref={cameraPanelRef} className="scanner-panel scanner-camera-panel" aria-label="Captura de cartas">
          <div className="scanner-camera-panel__heading"><h2>Pasa las cartas</h2>{!checking && <span>{drafts.length} en revisión</span>}</div>
          <p className="scanner-batch-summary">
            <span>{batchSummary}</span>
            <button type="button" className="scanner-sound-toggle" aria-pressed={soundOn}
              title={`${soundOn ? 'Silenciar' : 'Activar'} el aviso ${checking ? 'al comprobar' : 'al enviar a revisión'}`}
              aria-label={`Sonido ${checking ? 'al comprobar' : 'al enviar a revisión'}: ${soundOn ? 'activado' : 'silenciado'}`}
              onClick={() => { const next = !soundOn; setScanSoundEnabled(next); setSoundOn(next); if (next) { primeScanSound(); playScanSound(); } }}>
              {soundOn ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
            </button>
          </p>
          <ScannerCamera running={running} onFrame={readFrame} onStop={pause}>
            {running && live?.check ? <ScannerCheckResult result={live.check.result} alert={live.check.alert} limit={priceLimit} /> : running && live ? <div className={`scanner-camera__live${live.sent ? ' is-sent' : ''}`}>
              <img src={live.card.image} alt="" />
              <span><strong>{live.card.name}</strong><small>{live.detail}</small></span>
              <em>{live.sent ? <><Check size={14} aria-hidden="true" />Enviada</> : 'Quieta…'}</em>
            </div> : checking ? <span className="scanner-camera__hint">Mantenla quieta hasta ver la respuesta</span> : undefined}
          </ScannerCamera>
          <div className="scanner-actions scanner-session-actions">
            {running
              ? <button type="button" className="collections-page__btn" onClick={() => pause()}><Pause size={18} />Pausar</button>
              : <button type="button" className="collections-page__btn collections-page__btn--primary" disabled={!canStart || working} onClick={start}><Play size={18} />{checking ? (sessionSignature.current ? 'Continuar' : 'Iniciar comprobación') : drafts.length ? 'Continuar' : 'Iniciar escaneo'}</button>}
            {!checking && <button type="button" className="collections-page__btn" disabled={reviewSaving || !drafts.length} onClick={() => {
              const [latest] = drafts;
              const name = latest.candidates.find(card => card.id === latest.cardId)?.name ?? latest.candidates[0]?.name ?? 'la carta';
              setDrafts(entries => entries.map(entry => entry.id === latest.id ? withDraftQuantity(entry, draftQuantity(entry) + 1, () => crypto.randomUUID()) : entry));
              setStatus(`${name}: ${draftQuantity(latest) + 1} copias. Pasa la siguiente carta.`);
            }}>+1 copia de la última{drafts[0] && draftQuantity(drafts[0]) > 1 ? ` (×${draftQuantity(drafts[0])})` : ''}</button>}
          </div>
          <p className="scanner-live-status" role="status" aria-live="polite">{status}</p>
          {progress && <p className="scanner-progress">{progress}</p>}
          {!canStart && !running && <button type="button" className="collections-page__btn scanner-camera-configure" onClick={() => showStep('setup')}>{checking ? 'Ver ajustes de la comprobación' : 'Ver selección del catálogo'}</button>}
          {!checking && <button type="button" className="collections-page__btn scanner-open-review" disabled={!drafts.length || reviewSaving} onClick={() => showStep('review')}><ListChecks size={18} aria-hidden="true" />Revisar {drafts.length} pendientes</button>}
          <details className="scanner-help"><summary>Consejos y texto leído</summary>
            {checking ? <>
              <p>Mantén cada carta quieta hasta ver «Sí», «No» o «Dudosa» y pasa a la siguiente. «Dudosa» significa que varias cartas son posibles y no todas tienen la misma respuesta: revisa el número y el set para decidir.</p>
              <p>Sólo reconoce las cartas de tu selección del catálogo y responde por esas variantes. Una carta fuera de ella puede confundirse con la más parecida.</p>
            </> : <>
              <p>Mantén cada carta quieta hasta ver «Enviada a revisión» y pasa a la siguiente. Las lecturas dudosas quedan señaladas para corregirlas.</p>
              <p>Una carta quieta no se cuenta dos veces. Si tienes varias copias idénticas seguidas, escanea una y pulsa «+1 copia de la última» por cada copia extra; también puedes cambiar la cantidad en la revisión.</p>
            </>}
            <p className="scanner-privacy">OCR local en inglés y español. Las fotos no se envían al servidor. La revisión se respalda en este navegador. Sólo el guardado confirmado requiere conexión.</p>
            {lastText && <pre className="scanner-read-text">{lastText}</pre>}
          </details>
          {error && <p className="scanner-error" role="alert">{error}</p>}
          {owned.error && <p className="scanner-error" role="alert">{owned.error}</p>}
        </section>}
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

