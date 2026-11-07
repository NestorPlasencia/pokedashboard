import type { Card, ConditionKey } from '../types/dashboard';
import { automaticScanMatch, clearScanMatch, defaultDraftCardId, groupScanCards, proposedScanCard, type ScanDraft, type ScanMatch } from './cardScanner.ts';
import { ocrCheckCandidates, visualCheckCandidates, type CheckResult, type PriceAlert } from './scannerCheck.ts';
import type { VisualMatch } from './visualMatch.ts';

/**
 * What one card lying on the table turned out to be. Both uses read the same photo: a check
 * needs the cards it could be, and a draft needs them too but as a wider list to choose from,
 * in the same order and with the same notes the one-at-a-time scanner writes.
 */
export type TableRead = {
  /** The possible cards for a check, likeliest first. */
  groups: ScanMatch[];
  openEnded: boolean;
  /** The wider list offered in review. */
  draftKeys: string[];
  preferredId?: string;
  shown: Card;
  detail: string;
  note: string;
};

export function visualTableRead(visual: VisualMatch, numberText: string): TableRead {
  const top = visual.resolved ?? visual.shortlist[0];
  const proposed = visual.resolved ? proposedScanCard(visual.resolved.cards) : null;
  const printingNote = visual.resolved && visual.resolved.cards.length > 1 ? ' Revisa la impresión (1st Edition no se distingue por cámara).' : '';
  const shown = proposed ?? top.cards[0];
  const sets = new Set(visual.shortlist.map(group => group.cards[0].setName)).size;
  return {
    groups: visualCheckCandidates(visual, numberText),
    openEnded: false,
    draftKeys: [top, ...visual.shortlist, ...visual.related].map(group => group.key),
    preferredId: proposed?.id,
    shown,
    detail: visual.resolved ? `${shown.setName} · ${shown.number}` : `${sets} sets posibles · elige en revisión`,
    note: visual.resolvedBy === 'number' ? `La imagen y el número coinciden.${printingNote}`
      : visual.resolvedBy === 'name' ? `La imagen y el nombre coinciden; no se leyó el número.${printingNote}`
        : visual.resolvedBy === 'image' ? `Reconocida por la imagen; no se leyó el número.${printingNote}`
          : 'La ilustración coincide con varios sets y no se leyó el número: elige el correcto.',
  };
}

export function ocrTableRead(matches: ScanMatch[]): TableRead | null {
  const [match] = matches;
  if (!match) return null;
  const certain = automaticScanMatch(matches);
  const clear = clearScanMatch(matches);
  const { groups, openEnded } = ocrCheckCandidates(matches);
  const shown = certain?.card ?? match.cards[0];
  return {
    groups, openEnded,
    draftKeys: matches.slice(0, 6).map(candidate => candidate.key),
    preferredId: certain?.card.id,
    shown,
    detail: clear ? `${shown.setName} · ${shown.number}` : 'Lectura dudosa · elige en revisión',
    note: certain ? 'Nombre y número coinciden. Pendiente de revisión.' : 'Lectura dudosa: elige la carta y la impresión correctas.',
  };
}

/** A pending copy, exactly like one the scanner stages; only review can save it. */
export function tableDraft(read: TableRead, catalogCards: Card[], batch: { condition: ConditionKey; collectionId: string; id: string; createdAt: string }): ScanDraft {
  const groups = new Map(groupScanCards(catalogCards).map(group => [group.key, group.cards]));
  const candidates = [...new Set(read.draftKeys)].flatMap(key => groups.get(key) ?? []);
  return {
    id: batch.id, candidates, cardId: defaultDraftCardId(candidates, read.preferredId), condition: batch.condition,
    collectionId: batch.collectionId, approved: false, note: read.note, createdAt: batch.createdAt,
  };
}

export type TableCheck = { result: CheckResult; alert: PriceAlert | null };

/** The colour a card gets on the photo of the table. */
export const tableCheckTone = ({ result, alert }: TableCheck) =>
  alert && alert.level !== 'unpriced' ? 'alert' : result.verdict;

export function tableCheckSummary(checks: TableCheck[], unread: number): string {
  const count = (verdict: CheckResult['verdict']) => checks.filter(check => check.result.verdict === verdict).length;
  const pricey = checks.filter(check => check.alert && check.alert.level !== 'unpriced').length;
  const held = count('held'), absent = count('absent'), unclear = count('unclear');
  return [
    `${held} ${held === 1 ? 'está' : 'están'}`, `${absent} no ${absent === 1 ? 'está' : 'están'}`,
    ...(unclear ? [`${unclear} ${unclear === 1 ? 'dudosa' : 'dudosas'}`] : []),
    ...(unread ? [`${unread} sin reconocer`] : []),
    ...(pricey ? [`${pricey} sobre tu límite`] : []),
  ].join(' · ');
}

/** Below this the collector number is too small to read, whatever the camera. */
const READABLE_CARD_HEIGHT = 700;

export const cardsTooSmall = (cardHeights: number[]) => cardHeights.length > 0 && Math.min(...cardHeights) < READABLE_CARD_HEIGHT;

const TABLE_MODE_KEY = 'pokedashboard.scanner-table';

export function readTableMode(storage: Pick<Storage, 'getItem'>): boolean {
  try { return storage.getItem(TABLE_MODE_KEY) === 'on'; } catch { return false; }
}

export function saveTableMode(storage: Pick<Storage, 'setItem'>, enabled: boolean) {
  storage.setItem(TABLE_MODE_KEY, enabled ? 'on' : 'off');
}
