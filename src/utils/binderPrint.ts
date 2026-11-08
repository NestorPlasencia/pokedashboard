import type { Card, ViewOptions } from '../types/dashboard';

export type BinderPrintOptions = Pick<ViewOptions, 'binderLayout' | 'binderStyle' | 'binderPageColor' | 'binderSleeveColor'>;
type BinderPrintCard = Pick<Card, 'name' | 'image' | 'shadow'>;

const escapeHtml = (value: string | number) => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character);

// Printable area shared by A4 and Letter (the smaller side of each) minus 6mm margins,
// so a binder page or spread always fits on one sheet regardless of paper size.
const PRINT_SHORT_MM = 198;
const PRINT_LONG_MM = 265;

/**
 * Mirrors BinderView: same pocket order (row by row, left page then right page), page and
 * sleeve colours, empty pockets and dimmed shadow cards. Two-page binders print one spread
 * per landscape sheet; ringed binders print one page per portrait sheet.
 */
export const buildBinderPrintHtml = (cards: BinderPrintCard[], options: BinderPrintOptions): string => {
  const [rows, columns] = options.binderLayout.split('x').map(Number);
  const pocketsPerPage = rows * columns;
  const faceCount = Math.max(1, Math.ceil(cards.length / pocketsPerPage));
  const isTwoPage = options.binderStyle === 'twoPage';
  const gap = 2; const padding = 3; const ringGutter = isTwoPage ? 0 : 7; const spine = 1.5; const frame = 2; const label = 6;
  const sheetWidth = (isTwoPage ? PRINT_LONG_MM : PRINT_SHORT_MM) - frame * 2;
  const sheetHeight = (isTwoPage ? PRINT_SHORT_MM : PRINT_LONG_MM) - label - frame * 2;
  const pageWidth = isTwoPage ? (sheetWidth - spine) / 2 : sheetWidth;
  const pocketWidth = Math.min(
    (pageWidth - padding * 2 - ringGutter - gap * (columns - 1)) / columns,
    (sheetHeight - padding * 2 - gap * (rows - 1)) / (rows * 1.4)
  );

  const renderPage = (face: number, side: 'single' | 'left' | 'right') => {
    const pockets = Array.from({ length: pocketsPerPage }, (_, position) => {
      const card = face < faceCount ? cards[face * pocketsPerPage + position] : undefined;
      return `<div class="pocket">${card?.image ? `<img class="${card.shadow ? 'dimmed' : ''}" src="${escapeHtml(card.image)}" alt="${escapeHtml(card.name)}">` : ''}</div>`;
    }).join('');
    const rings = side === 'single' ? '<div class="rings"><i></i><i></i><i></i></div>' : '';
    return `<div class="page page--${side}">${rings}<div class="pockets">${pockets}</div></div>`;
  };

  const spreadCount = Math.ceil(faceCount / 2);
  const sheets = isTwoPage
    ? Array.from({ length: spreadCount }, (_, index) =>
      `<section class="sheet"><div class="sheet-label">Spread ${index + 1} of ${spreadCount}</div><div class="binder spread">${renderPage(index * 2, 'left')}${renderPage(index * 2 + 1, 'right')}</div></section>`)
    : Array.from({ length: faceCount }, (_, index) =>
      `<section class="sheet"><div class="sheet-label">Page ${index + 1} of ${faceCount}</div><div class="binder">${renderPage(index, 'single')}</div></section>`);

  return `<!DOCTYPE html><html><head><title>Print - Binder</title><style>
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;padding:12px;font-family:Arial,sans-serif;background:#e5e7eb;color:#172033}
    .sheet{display:flex;flex-direction:column;align-items:center;margin:0 auto 12px;break-after:page;page-break-after:always;break-inside:avoid}
    .sheet:last-child{break-after:auto;page-break-after:auto}
    .sheet-label{height:${label}mm;font-size:9px;font-weight:700;color:#475569;line-height:${label}mm}
    .binder{display:flex;padding:${frame}mm;border:.3mm solid #475569;border-radius:3mm;background:${escapeHtml(options.binderPageColor)}}
    .spread{gap:${spine}mm}
    .page{position:relative;display:flex;padding:${padding}mm;padding-left:${padding + ringGutter}mm;border-radius:2mm;background:${escapeHtml(options.binderPageColor)}}
    .page--left{border-right:.3mm solid #475569;border-radius:2mm 0 0 2mm}
    .page--right{border-left:.3mm solid #475569;border-radius:0 2mm 2mm 0}
    .rings{position:absolute;inset:0 auto 0 1.5mm;display:flex;flex-direction:column;justify-content:space-around;width:4.5mm}
    .rings i{display:block;width:4.5mm;height:4.5mm;border:1.2mm solid #a6adb9;border-radius:50%;background:#383d45}
    .pockets{display:grid;grid-template-columns:repeat(${columns},${pocketWidth.toFixed(2)}mm);grid-auto-rows:${(pocketWidth * 1.4).toFixed(2)}mm;gap:${gap}mm}
    .pocket{display:flex;align-items:center;justify-content:center;padding:.8mm;overflow:hidden;border:.3mm solid rgba(220,235,250,.35);border-radius:1.2mm;background:${escapeHtml(options.binderSleeveColor)}}
    .pocket img{display:block;width:100%;height:100%;object-fit:contain}
    .pocket img.dimmed{filter:grayscale(100%) brightness(35%)}
    @media print{
      @page{size:${isTwoPage ? 'landscape' : 'portrait'};margin:6mm}
      body{padding:0;background:#fff}
      .sheet{height:${isTwoPage ? PRINT_SHORT_MM : PRINT_LONG_MM}mm;margin:0;justify-content:center}
    }
  </style></head><body>${sheets.join('')}</body></html>`;
};
