import type { Card, ConditionKey } from '../types/dashboard';
import type { FilterParams } from './urlParams';

export type ScanScope = {
  series: string[];
  sets: string[];
  min: string;
  max: string;
  rarities?: string[];
  topLevelVariants?: string[];
  variants?: string[];
};

export const BASE_GYM_SCAN_SCOPE: ScanScope = {
  series: ['Base', 'Gym'], sets: ['Gym Challenge', 'Gym Heroes', 'Team Rocket', 'Base Set 2', 'Fossil', 'Jungle', 'Base Set'],
  rarities: ['Common', 'Uncommon', 'Rare'], topLevelVariants: ['Standard'], variants: [], min: '', max: '',
};

export function scanScopeFromFilters(params: FilterParams): ScanScope {
  const specific = (values?: string[]) => (values ?? []).filter(value => value !== 'All');
  return {
    series: specific(params.series).length ? specific(params.series).filter(value => !params.notSeries?.includes(value)) : ['Base', 'Gym'],
    sets: specific(params.set), rarities: specific(params.rarity), variants: specific(params.variants),
    topLevelVariants: params.cardVariantTopLevel ? specific(params.cardVariantTopLevel) : ['Standard'], min: '', max: '',
  };
}

/** Sets with a 1st Edition call their regular print "Unlimited"; others call it "Normal".
 * Both are the same physical finish, so the batch printing treats them as one.
 */
export const scanPrinting = (card: Card): string => (card.printing || card.variant)
  .replace(/^Unlimited$/, 'Normal').replace(/^Unlimited Holofoil$/, 'Holofoil');

/** Pick the main rear lens; facingMode alone lets some phones open the telephoto. */
export function mainBackCamera(devices: Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>[]): string | null {
  const cameras = devices.filter(device => device.kind === 'videoinput' && device.deviceId);
  const back = cameras.filter(device => /back|rear|environment|trasera/i.test(device.label));
  const rank = (label: string) => (/tele|zoom|ultra|macro|depth|infrared/i.test(label) ? 1000 : 0) +
    Number(label.match(/camera2? (\d+)/i)?.[1] ?? 500);
  return [...back].sort((a, b) => rank(a.label) - rank(b.label))[0]?.deviceId ?? null;
}

export type ScanDraft = {
  id: string;
  candidates: Card[];
  cardId: string;
  condition: ConditionKey;
  collectionId: string;
  approved: boolean;
  note: string;
  createdAt: string;
  /** Ids for identical copies after the first; each saved copy keeps its own id for safe retries. */
  extraCopyIds?: string[];
};

export const draftQuantity = (draft: ScanDraft) => 1 + (draft.extraCopyIds?.length ?? 0);

export function withDraftQuantity(draft: ScanDraft, quantity: number, newId: () => string): ScanDraft {
  const extra = Math.max(0, Math.min(98, Math.floor(quantity) - 1));
  const ids = (draft.extraCopyIds ?? []).slice(0, extra);
  while (ids.length < extra) ids.push(newId());
  return { ...draft, extraCopyIds: ids };
}

/** A lone candidate needs no choice in review. */
export const defaultDraftCardId = (candidates: Card[], certainId = '') =>
  certainId || (candidates.length === 1 ? candidates[0].id : '');

export type ScanMatch = {
  key: string;
  cards: Card[];
  score: number;
  evidence: string[];
};

export const normalizeScanText = (text: string): string => text
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const normalizeNumber = (text: string): string => text.toUpperCase()
  .replace(/\s+/g, '').replace(/^([A-Z]*)0+(?=\d)/, '$1');

const cardNumber = (card: Card) => normalizeNumber(card.number.split('/')[0]);

export function scanScopeError(scope: ScanScope): string {
  if (!scope.series.length) return 'Selecciona al menos una serie.';
  if ([scope.min, scope.max].some(value => value !== '' && !/^\d+$/.test(value))) {
    return 'El rango debe contener números enteros positivos o cero.';
  }
  if (scope.min !== '' && scope.max !== '' && Number(scope.min) > Number(scope.max)) {
    return 'El inicio del rango no puede superar el final.';
  }
  return '';
}

/** Scope is a hard boundary, independent of the catalog's search/ownership filters. */
export function cardsInScanScope(cards: Card[], scope: ScanScope): Card[] {
  if (scanScopeError(scope)) return [];
  return cards.filter(card => {
    if (!(card.setSeriesNames ?? [card.setSeries]).some(series => scope.series.includes(series))) return false;
    if (scope.sets.length && !(card.setNames ?? [card.setName]).some(set => scope.sets.includes(set))) return false;
    if (scope.rarities?.length && !(card.rarities?.length ? card.rarities : [card.rarity]).some(value => scope.rarities?.includes(value))) return false;
    if (scope.topLevelVariants?.length && !scope.topLevelVariants.includes(card.cardVariantTopLevel || card.variant)) return false;
    if (scope.variants?.length && !scope.variants.includes(card.variant)) return false;
    if (scope.min === '' && scope.max === '') return true;
    const number = cardNumber(card);
    // A numeric range must not silently include unrelated TG/SV/promo numbers.
    if (!/^\d+$/.test(number)) return false;
    return (scope.min === '' || Number(number) >= Number(scope.min)) &&
      (scope.max === '' || Number(number) <= Number(scope.max));
  });
}

/** Keep the printing alternatives together for review of one logical card. */
export function groupScanCards(cards: Card[]): ScanMatch[] {
  const groups = new Map<string, ScanMatch>();
  for (const card of cards) {
    const key = JSON.stringify([card.setId, cardNumber(card), normalizeScanText(card.name)]);
    const group = groups.get(key) ?? { key, cards: [], score: 0, evidence: [] };
    if (!group.cards.some(entry => entry.id === card.id)) group.cards.push(card);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const editDistance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = next;
  }
  return previous[b.length];
};

/** Fuzzy matching is limited to the name crop, never attack text or HP numbers. */
const nameSimilarity = (name: string, text: string): number => {
  const target = normalizeScanText(name);
  const normalized = normalizeScanText(text);
  if (!target || !normalized) return 0;
  if (` ${normalized} `.includes(` ${target} `)) return 1;
  const words = normalized.split(' ');
  const count = target.split(' ').length;
  let best = 0;
  for (let i = 0; i < words.length; i++) {
    const candidate = words.slice(i, i + count).join(' ');
    best = Math.max(best, 1 - editDistance(target, candidate) / Math.max(target.length, candidate.length));
  }
  // One misread letter turns "will" into "Bill", so short names must be read exactly.
  return best >= 0.72 && target.length >= 6 ? best : 0;
};

export function rankScanMatches(cards: Card[], nameText: string, numberText: string): ScanMatch[] {
  const fractions = [...numberText.toUpperCase().matchAll(/\b([A-Z]{0,3}\s*\d{1,4})\s*[/／]\s*([A-Z]{0,3}\s*\d{1,4})\b/g)]
    .map(match => [normalizeNumber(match[1]), normalizeNumber(match[2])]);
  const bareNumber = numberText.trim().match(/^#?\s*([A-Z]{0,3}\d{1,4})\s*$/i)?.[1];
  return groupScanCards(cards).map(group => {
    const card = group.cards[0];
    const similarity = nameSimilarity(card.name, nameText);
    const number = cardNumber(card);
    const knownTotal = group.cards.map(entry => (entry.tcgPlayerNumber || entry.number).split('/')[1])
      .filter(Boolean).map(normalizeNumber);
    const matchingFractions = fractions.filter(([numerator]) => numerator === number);
    const fraction = matchingFractions.find(([, total]) => knownTotal.includes(total)) ?? matchingFractions[0];
    const totalMatches = Boolean(fraction && knownTotal.includes(fraction[1]));
    const wrongTotal = Boolean(fraction && knownTotal.length && !totalMatches);
    const numberMatches = Boolean(fraction || (bareNumber && normalizeNumber(bareNumber) === number));
    const evidence: string[] = [];
    if (similarity === 1) evidence.push('Nombre leído');
    else if (similarity) evidence.push('Nombre parecido');
    if (numberMatches) evidence.push(totalMatches ? 'Número y total coinciden' : 'Número coincide');
    if (wrongTotal) evidence.push('El total del set no coincide');
    return { ...group, evidence, score: similarity * 60 + (numberMatches ? 35 : 0) + (totalMatches ? 15 : 0) - (wrongTotal ? 45 : 0) };
  }).filter(match => match.score >= 30)
    .sort((a, b) => b.score - a.score || a.cards[0].setName.localeCompare(b.cards[0].setName));
}

/** Preselect a suggestion only when the name+number identify one clear product. */
export function automaticScanMatch(matches: ScanMatch[]): { key: string; card: Card } | null {
  const best = matches[0];
  if (!best || best.score < 95 || !best.evidence.includes('Nombre leído') ||
    !best.evidence.some(value => value === 'Número coincide' || value === 'Número y total coinciden') ||
    best.evidence.includes('El total del set no coincide') ||
    (matches[1] && best.score - matches[1].score < 15)) return null;
  const products = new Map(best.cards.filter(card => Number.isInteger(card.productId) && (card.productId ?? 0) > 0)
    .map(card => [JSON.stringify([card.productId, card.printing || card.variant]), card]));
  if (products.size !== 1) return null;
  return { key: best.key, card: [...products.values()][0] };
}

/** Require two agreeing reads, then latch until a different card is staged.
 * Blurry reads never rearm a held card and cause a duplicate.
 */
export function createScanGate() {
  let candidate = '';
  let count = 0;
  let latched = '';
  return {
    observe(key: string | null): boolean {
      if (!key || key === latched) { candidate = ''; count = 0; return false; }
      count = key === candidate ? count + 1 : 1;
      candidate = key;
      return count >= 2;
    },
    commit(key: string) { latched = key; candidate = ''; count = 0; },
    isLatched(key: string) { return key === latched; },
    rearm() { latched = ''; candidate = ''; count = 0; },
  };
}

export type ImageRect = { x: number; y: number; width: number; height: number };

/** Map a guide over an object-fit:cover video back into camera pixels. */
export function cameraSourceRect(sourceWidth: number, sourceHeight: number, viewWidth: number, viewHeight: number, guide: ImageRect): ImageRect {
  const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
  return {
    x: ((sourceWidth * scale - viewWidth) / 2 + guide.x) / scale,
    y: ((sourceHeight * scale - viewHeight) / 2 + guide.y) / scale,
    width: guide.width / scale,
    height: guide.height / scale,
  };
}
