import { Camera, Check, ImageUp, ListPlus, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { createCardOcr } from '../../services/cardOcr';
import { createCardEmbedder } from '../../services/cardVectors';
import type { InventoryEntry } from '../../services/inventory';
import { photoFromFile, photoPixels, pictureOf, sharpestFrame, shrunkPixels, straightenCard, upsideDown } from '../../services/tableCapture';
import type { Card, ConditionKey } from '../../types/dashboard';
import type { CardQuad } from '../../utils/cardDetection';
import { mainBackCamera, rankScanMatches, type ScanDraft } from '../../utils/cardScanner';
import { money } from '../../utils/reportDisplay';
import { checkPriceAlert, checkScan } from '../../utils/scannerCheck';
import { playScanSound, primeScanSound } from '../../utils/scanSound';
import { detectTableCards, sameLayout } from '../../utils/tableDetection';
import { cardsTooSmall, ocrTableRead, tableCheckSummary, tableCheckTone, tableDraft, visualTableRead, type TableCheck, type TableRead } from '../../utils/tableScan';
import { rankVisualMatches, vectorSimilarity, type CardVectorIndex } from '../../utils/visualMatch';
import { ScannerCheckResult } from './ScannerCheckResult';

/** How many looks at a still table before the photo is taken on its own, about two seconds. */
const STILL_LOOKS = 4;
const LIVE_DETECTION_SIZE = 640;
const PHOTO_DETECTION_SIZE = 1280;

type Phase = 'aiming' | 'working' | 'done';
type Size = { width: number; height: number };
type TableCard = {
  id: string;
  quad: CardQuad;
  picture: string;
  /** null once read and not recognised; undefined until it is read. */
  read?: TableRead | null;
  chosen: boolean;
};

export function ScannerTable({
  panelRef, running, canStart, onStart, onStop, summary, cards, catalogCards, vectorIndex, hasVisual,
  checking, entriesByProductId, checkScope, catalogByProduct, priceLimit, condition, collectionId, onStage,
}: {
  panelRef: Ref<HTMLElement>;
  running: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: (message?: string) => void;
  summary: string;
  /** Where to look for each card: the selection, narrowed by the chosen printing. */
  cards: Card[];
  catalogCards: Card[];
  vectorIndex: CardVectorIndex | null;
  hasVisual: boolean;
  checking: boolean;
  entriesByProductId: ReadonlyMap<number, InventoryEntry[]>;
  checkScope: ReadonlySet<string>;
  catalogByProduct: ReadonlyMap<number, Card[]>;
  priceLimit: number | null;
  condition: ConditionKey;
  collectionId: string;
  onStage: (drafts: ScanDraft[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('aiming');
  const phaseRef = useRef<Phase>('aiming');
  const [autoCapture, setAutoCapture] = useState(true);
  const autoRef = useRef(true);
  const [outlines, setOutlines] = useState<{ quads: CardQuad[]; size: Size; rejected: number } | null>(null);
  const [frozen, setFrozen] = useState<{ picture: string; size: Size } | null>(null);
  const [tableCards, setTableCards] = useState<TableCard[]>([]);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState('Pon las cartas sobre una mesa lisa, separadas entre sí, y enfoca desde arriba.');
  const [sent, setSent] = useState(false);
  const generation = useRef(0);
  const ocrRef = useRef<ReturnType<typeof createCardOcr> | null>(null);
  const embedderRef = useRef<ReturnType<typeof createCardEmbedder> | null>(null);
  const callbacks = useRef<{ processPhoto: ((photo: HTMLCanvasElement) => Promise<void>) | null; onStop: typeof onStop }>({ processPhoto: null, onStop });
  autoRef.current = autoCapture;

  const moveTo = (next: Phase) => { phaseRef.current = next; setPhase(next); };

  useEffect(() => () => {
    generation.current++;
    ocrRef.current?.dispose(); ocrRef.current = null;
    embedderRef.current?.dispose(); embedderRef.current = null;
  }, []);

  /** Reads one straightened card, trying it both ways up: the table has no right way round. */
  const identify = async (card: HTMLCanvasElement, isStale: () => boolean): Promise<TableRead | null> => {
    ocrRef.current ??= createCardOcr(setProgress);
    const ocr = ocrRef.current;
    const turned = upsideDown(card);
    if (vectorIndex && hasVisual) {
      embedderRef.current ??= createCardEmbedder(vectorIndex.model, setProgress);
      const embedder = embedderRef.current;
      const similarityTo = (query: Float32Array) => (entry: Card) => {
        const row = vectorIndex.rows.get(entry.image);
        return row ? vectorSimilarity(query, row) : undefined;
      };
      const views = [{ canvas: card, query: await embedder.embed(card) }, { canvas: turned, query: await embedder.embed(turned) }];
      if (isStale()) return null;
      const ranked = views.map(view => ({ ...view, best: rankVisualMatches(cards, similarityTo(view.query), '')?.best ?? 0 }));
      const view = ranked[0].best >= ranked[1].best ? ranked[0] : ranked[1];
      if (view.best > 0) {
        const located = { canvas: view.canvas, detected: true };
        const similarity = similarityTo(view.query);
        const { number } = await ocr.recognize(view.canvas, { located, numberOnly: true });
        let visual = rankVisualMatches(cards, similarity, number);
        // Without a readable number, the name tells look-alikes apart.
        if (visual && visual.resolvedBy !== 'number' && !isStale()) {
          const { name } = await ocr.recognize(view.canvas, { located, nameOnly: true });
          visual = rankVisualMatches(cards, similarity, number, name);
        }
        if (visual) return visualTableRead(visual, number);
      }
    }
    for (const canvas of [card, turned]) {
      if (isStale()) return null;
      const text = await ocr.recognize(canvas, { located: { canvas, detected: true } });
      const read = ocrTableRead(rankScanMatches(cards, text.name, text.number));
      if (read) return read;
    }
    return null;
  };

  /** The whole preprocessing of one photo: find, straighten, and read each card in turn. */
  const processPhoto = async (photo: HTMLCanvasElement) => {
    const current = ++generation.current;
    const isStale = () => current !== generation.current;
    moveTo('working');
    setSent(false);
    setOutlines(null);
    setTableCards([]);
    setMessage('Buscando las cartas en la foto…');
    const size = { width: photo.width, height: photo.height };
    setFrozen({ picture: pictureOf(photo, Math.min(1280, photo.width)), size });
    // Let the frozen photo paint before the long synchronous work.
    await new Promise(resolve => window.setTimeout(resolve, 30));
    const shrunk = shrunkPixels(photo, photo.width, photo.height, PHOTO_DETECTION_SIZE);
    const detection = detectTableCards(shrunk.data, shrunk.width, shrunk.height);
    if (isStale()) return;
    const quads = detection.quads.map(quad => quad.map(point => ({ x: point.x / shrunk.scale, y: point.y / shrunk.scale })) as CardQuad);
    if (!quads.length) {
      setFrozen(null);
      moveTo('aiming');
      setMessage(detection.rejected ? 'Las cartas están pegadas o cortadas por el borde. Sepáralas y vuelve a intentarlo.' : 'No se encontraron cartas. Acércate y usa un fondo liso.');
      return;
    }
    const pixels = photoPixels(photo);
    const straightened = quads.map(quad => straightenCard(pixels, quad));
    const found: TableCard[] = quads.map((quad, index) => ({ id: crypto.randomUUID(), quad, picture: pictureOf(straightened[index], 180), chosen: true }));
    setTableCards(found);
    const heights = quads.map(([, b, c]) => Math.hypot(c.x - b.x, c.y - b.y));
    const warnings = [
      ...(detection.rejected ? [`${detection.rejected === 1 ? '1 objeto no parece' : `${detection.rejected} objetos no parecen`} una carta: si están pegadas, sepáralas.`] : []),
      ...(cardsTooSmall(heights) ? ['Las cartas salen pequeñas y el número puede no leerse: acércate o sube una foto.'] : []),
    ];
    const reads: (TableRead | null)[] = [];
    for (let index = 0; index < found.length; index++) {
      setMessage(`Leyendo la carta ${index + 1} de ${found.length}…`);
      let read: TableRead | null = null;
      try { read = await identify(straightened[index], isStale); }
      catch { if (!isStale()) setMessage('No se pudo leer una carta. Revisa la conexión para descargar el reconocimiento.'); }
      if (isStale()) return;
      reads.push(read);
      setTableCards(entries => entries.map(entry => entry.id === found[index].id ? { ...entry, read, chosen: Boolean(read) } : entry));
    }
    setProgress('');
    moveTo('done');
    setMessage([`${found.length} ${found.length === 1 ? 'carta leída' : 'cartas leídas'}.`, ...warnings].join(' '));
    const recognised = reads.filter((read): read is TableRead => Boolean(read));
    const pricey = checking && recognised.some(read => { const alert = checkPriceAlert(read.groups, priceLimit); return alert && alert.level !== 'unpriced'; });
    navigator.vibrate?.(pricey ? [120, 60, 120] : 80);
    playScanSound(pricey ? 'alert' : 'confirm');
  };
  callbacks.current = { processPhoto, onStop };

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const video = videoRef.current;
    const release = () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (video) video.srcObject = null;
    };
    const hide = () => {
      if (document.hidden) { release(); callbacks.current.onStop('Sesión pausada al salir de la app. Pulsa Continuar para volver a encender la cámara.'); }
    };
    const leave = () => { release(); callbacks.current.onStop('Sesión pausada.'); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);

    let still = 0;
    let previous: CardQuad[] = [];
    /** The layout already photographed: it takes a changed table to fire again on its own. */
    let photographed: CardQuad[] = [];
    const look = async () => {
      if (cancelled) return;
      try {
        if (phaseRef.current === 'aiming' && video?.videoWidth && video.readyState >= 2) {
          const shrunk = shrunkPixels(video, video.videoWidth, video.videoHeight, LIVE_DETECTION_SIZE);
          const { quads, rejected } = detectTableCards(shrunk.data, shrunk.width, shrunk.height);
          setOutlines({ quads, rejected, size: { width: shrunk.width, height: shrunk.height } });
          const tolerance = Math.max(shrunk.width, shrunk.height) * 0.02;
          still = quads.length && sameLayout(quads, previous, tolerance) ? still + 1 : 0;
          previous = quads;
          if (!quads.length) photographed = [];
          if (autoRef.current && still >= STILL_LOOKS - 1 && !sameLayout(quads, photographed, tolerance)) {
            still = 0;
            photographed = quads;
            await callbacks.current.processPhoto?.(await sharpestFrame(video));
          }
        } else still = 0;
      } catch {
        if (!cancelled) { release(); callbacks.current.onStop('No se pudo procesar el video. La sesión está pausada; vuelve a intentar.'); }
      }
      if (!cancelled) timer = window.setTimeout(() => void look(), 500);
    };

    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('HTTPS required');
        // Several cards share the frame, so every pixel the camera offers counts.
        const size = { width: { ideal: 3840 }, height: { ideal: 2160 } };
        let acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, ...size } });
        const main = mainBackCamera(await navigator.mediaDevices.enumerateDevices());
        if (main && !cancelled && acquired.getVideoTracks()[0]?.getSettings().deviceId !== main) {
          acquired.getTracks().forEach(track => track.stop());
          acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: main }, ...size } })
            .catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, ...size } }));
        }
        if (cancelled) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        if (!video) throw new Error('Video unavailable');
        video.srcObject = stream;
        await video.play();
        if (!cancelled) void look();
      } catch (error) {
        if (cancelled) return;
        release();
        const name = (error as { name?: string }).name;
        callbacks.current.onStop(name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en el navegador y vuelve a iniciar.'
          : name === 'NotFoundError' ? 'No se encontró una cámara disponible. Puedes subir una foto.'
            : 'No se pudo abrir la cámara. Usa HTTPS y cierra otras apps que la estén usando, o sube una foto.');
      }
    };
    void start();
    return () => {
      release();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
    };
  }, [running]);

  const captureNow = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || phaseRef.current !== 'aiming') return;
    primeScanSound();
    await processPhoto(await sharpestFrame(video));
  };

  const nextTable = () => {
    generation.current++;
    setFrozen(null); setTableCards([]); setProgress(''); setSent(false);
    setMessage('Cambia las cartas y enfoca la mesa de nuevo.');
    moveTo('aiming');
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    primeScanSound();
    try { await processPhoto(await photoFromFile(file)); }
    catch { moveTo('aiming'); setFrozen(null); setMessage('No se pudo abrir esa foto. Prueba con otra.'); }
  };

  // Worked out here, not stored, so a changed limit or a refreshed inventory shows at once.
  const checks = useMemo(() => new Map(tableCards.flatMap((card): [string, TableCheck][] => card.read && checking ? [[card.id, {
    result: checkScan(card.read.groups, entriesByProductId, checkScope, { openEnded: card.read.openEnded, catalogByProduct }),
    alert: checkPriceAlert(card.read.groups, priceLimit),
  }]] : [])), [tableCards, checking, entriesByProductId, checkScope, catalogByProduct, priceLimit]);
  const finished = tableCards.filter(card => card.read !== undefined);
  const unread = finished.filter(card => !card.read).length;
  const chosen = tableCards.filter(card => card.read && card.chosen);

  const sendToReview = () => {
    const createdAt = new Date().toISOString();
    onStage(chosen.flatMap(card => card.read ? [tableDraft(card.read, catalogCards, { condition, collectionId, id: crypto.randomUUID(), createdAt })] : []));
    setSent(true);
    setMessage(`${chosen.length} ${chosen.length === 1 ? 'carta enviada' : 'cartas enviadas'} a revisión.`);
  };

  const toneOf = (card: TableCard) => {
    if (card.read === undefined) return 'pending';
    if (!card.read) return 'unread';
    const check = checks.get(card.id);
    return check ? tableCheckTone(check) : 'read';
  };
  const stageSize = frozen?.size ?? outlines?.size;
  const quads = frozen ? tableCards.map(card => card.quad) : outlines?.quads ?? [];
  const live = running && phase === 'aiming';

  return <section ref={panelRef} className="scanner-panel scanner-camera-panel scanner-table" aria-label="Captura de la mesa">
    <div className="scanner-camera-panel__heading"><h2>Cartas en la mesa</h2>{outlines && live && <span>{outlines.quads.length === 1 ? '1 detectada' : `${outlines.quads.length} detectadas`}</span>}</div>
    <p className="scanner-batch-summary"><span>{summary}</span></p>
    <div className="scanner-table__stage" style={stageSize ? { aspectRatio: `${stageSize.width} / ${stageSize.height}` } : undefined}>
      <video ref={videoRef} autoPlay muted playsInline hidden={Boolean(frozen)} aria-label="Video de la mesa" />
      {frozen && <img src={frozen.picture} alt="Foto de la mesa" />}
      {!running && !frozen && <div className="scanner-camera__placeholder"><Camera size={38} aria-hidden="true" /><span>Cámara apagada</span></div>}
      {stageSize && <svg viewBox={`0 0 ${stageSize.width} ${stageSize.height}`} aria-hidden="true">
        {quads.map((quad, index) => {
          const card = frozen ? tableCards[index] : undefined;
          const x = quad.reduce((sum, point) => sum + point.x, 0) / 4, y = quad.reduce((sum, point) => sum + point.y, 0) / 4;
          const radius = Math.max(stageSize.width, stageSize.height) * 0.022;
          return <g key={index} className={`scanner-table__mark is-${card ? toneOf(card) : 'live'}`}>
            <polygon points={quad.map(point => `${point.x},${point.y}`).join(' ')} style={{ strokeWidth: radius / 3.5 }} />
            {frozen && <><circle cx={x} cy={y} r={radius} /><text x={x} y={y} dy=".35em" textAnchor="middle" fontSize={radius * 1.2}>{index + 1}</text></>}
          </g>;
        })}
      </svg>}
    </div>
    <div className="scanner-actions scanner-session-actions">
      {!running && phase !== 'working' && <button type="button" className="collections-page__btn collections-page__btn--primary" disabled={!canStart} onClick={onStart}><Play size={18} aria-hidden="true" />Abrir cámara</button>}
      {running && phase === 'aiming' && <button type="button" className="collections-page__btn collections-page__btn--primary" disabled={!outlines?.quads.length} onClick={() => void captureNow()}><Camera size={18} aria-hidden="true" />Capturar ahora</button>}
      {running && <button type="button" className="collections-page__btn" onClick={() => onStop()}><Pause size={18} aria-hidden="true" />Pausar</button>}
      {phase !== 'aiming' && <button type="button" className="collections-page__btn" onClick={nextTable}><RotateCcw size={18} aria-hidden="true" />{phase === 'working' ? 'Cancelar y repetir' : 'Siguiente mesa'}</button>}
      <button type="button" className="collections-page__btn" disabled={!canStart || phase === 'working'} onClick={() => uploadRef.current?.click()}><ImageUp size={18} aria-hidden="true" />Subir foto</button>
      <input ref={uploadRef} type="file" accept="image/*" hidden onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
    <label className="scanner-table__auto"><input type="checkbox" checked={autoCapture} onChange={event => setAutoCapture(event.target.checked)} />Capturar sola cuando la mesa esté quieta</label>
    <p className="scanner-live-status" role="status" aria-live="polite">{checking && phase === 'done' ? `${tableCheckSummary([...checks.values()], unread)}. ` : ''}{message}</p>
    {outlines && live && outlines.rejected > 0 && <p className="scanner-progress">Hay {outlines.rejected === 1 ? 'un objeto que no parece' : `${outlines.rejected} objetos que no parecen`} una carta: sepáralas si están pegadas.</p>}
    {progress && <p className="scanner-progress">{progress}</p>}
    {tableCards.length > 0 && <ol className="scanner-table__list">
      {tableCards.map((card, index) => {
        const check = checks.get(card.id);
        return <li key={card.id} className="scanner-table__row">
          <span className="scanner-table__index">{index + 1}</span>
          <img className="scanner-table__crop" src={card.picture} alt={`Carta ${index + 1} de la foto`} />
          <div className="scanner-table__answer">
            {card.read === undefined ? <p>Leyendo…</p>
              : !card.read ? <p><strong>No reconocida.</strong> Está fuera de tu selección, o son dos cartas pegadas.</p>
                : check ? <ScannerCheckResult result={check.result} alert={check.alert} limit={priceLimit} />
                  : <label className="scanner-table__draft">
                    <input type="checkbox" checked={card.chosen} disabled={sent} onChange={event => setTableCards(entries => entries.map(entry => entry.id === card.id ? { ...entry, chosen: event.target.checked } : entry))} />
                    <span><strong>{card.read.shown.name}</strong><small>{card.read.detail}</small></span>
                  </label>}
          </div>
        </li>;
      })}
    </ol>}
    {!checking && phase === 'done' && chosen.length > 0 && <button type="button" className="collections-page__btn collections-page__btn--primary scanner-table__send" disabled={sent} onClick={sendToReview}>
      {sent ? <><Check size={18} aria-hidden="true" />Enviadas a revisión</> : <><ListPlus size={18} aria-hidden="true" />Enviar {chosen.length} a revisión</>}
    </button>}
    {checking && priceLimit !== null && phase === 'done' && <small>Aviso de precio sobre {money(priceLimit)}.</small>}
    <details className="scanner-help"><summary>Consejos</summary>
      <p>Usa una mesa lisa y buena luz, y evita reflejos. Deja un espacio entre cartas: dos pegadas no se pueden separar. Las cartas pueden estar giradas o al revés.</p>
      <p>Cuanto más cerca, mejor se lee el número. Si son muchas, haz varias fotos por grupos, o sube una foto de la cámara del teléfono, que tiene más resolución que el video.</p>
      <p className="scanner-privacy">Las fotos se procesan en este dispositivo y no se envían al servidor.</p>
    </details>
  </section>;
}
