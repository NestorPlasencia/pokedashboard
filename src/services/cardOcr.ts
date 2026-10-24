import type { Worker } from 'tesseract.js';
import { locateAndCropCard, type LocatedCard } from '../utils/cardDetection';

/** One worker per scanner session; no photo is sent to a server. */
export function createCardOcr(onProgress: (message: string) => void) {
  let pending: Promise<Worker> | null = null;
  let disposed = false;
  const getWorker = () => {
    if (disposed) throw new Error('Scanner closed');
    if (!pending) {
      pending = import('tesseract.js').then(({ createWorker }) => createWorker(['eng', 'spa'], 1, {
        workerPath: new URL('/ocr/v7/worker.min.js', window.location.origin).href,
        corePath: new URL('/ocr/v7', window.location.origin).href,
        langPath: new URL('/ocr/v7', window.location.origin).href,
        workerBlobURL: false,
        logger: ({ status, progress }) => {
          if (!disposed) onProgress(status === 'recognizing text'
            ? `Leyendo texto… ${Math.round(progress * 100)}%`
            : 'Preparando OCR en este dispositivo…');
        },
      })).then(async worker => {
        if (disposed) { await worker.terminate(); throw new Error('Scanner closed'); }
        await worker.setParameters({ user_defined_dpi: '300', tessedit_pageseg_mode: '11' as import('tesseract.js').PSM });
        return worker;
      }).catch(error => { pending = null; throw error; });
    }
    return pending;
  };

  return {
    /** `numberOnly` skips the name passes when the card is identified by its image. */
    async recognize(image: HTMLCanvasElement, options: { located?: LocatedCard; numberOnly?: boolean } = {}) {
      const worker = await getWorker();
      const located = options.located ?? locateAndCropCard(image);
      // Upscaling and grayscale improve the small collector number on older cards.
      const prepared = document.createElement('canvas');
      prepared.width = 1100;
      prepared.height = Math.round(located.canvas.height * prepared.width / located.canvas.width);
      const context = prepared.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.filter = 'grayscale(1) contrast(1.25)';
      context.drawImage(located.canvas, 0, 0, prepared.width, prepared.height);
      let nameText = '';
      if (!options.numberOnly) {
        await worker.setParameters({ tessedit_pageseg_mode: '11' as import('tesseract.js').PSM });
        const name = await worker.recognize(prepared, { rectangle: {
          left: Math.round(prepared.width * 0.05), top: Math.round(prepared.height * 0.025),
          width: Math.round(prepared.width * 0.9), height: Math.round(prepared.height * 0.14),
        } });
        if (disposed) throw new Error('Scanner closed');
        // Isolate the name line from the stage label, HP and energy symbols.
        await worker.setParameters({ tessedit_pageseg_mode: '7' as import('tesseract.js').PSM });
        const nameLine = await worker.recognize(prepared, { rectangle: {
          left: Math.round(prepared.width * 0.055), top: Math.round(prepared.height * 0.055),
          width: Math.round(prepared.width * 0.64), height: Math.round(prepared.height * 0.06),
        } });
        nameText = `${name.data.text.trim()}\n${nameLine.data.text.trim()}`;
      }
      await worker.setParameters({ tessedit_pageseg_mode: '11' as import('tesseract.js').PSM });
      const number = await worker.recognize(prepared, { rectangle: {
        left: Math.round(prepared.width * 0.04), top: Math.floor(prepared.height * 0.86),
        width: Math.round(prepared.width * 0.92), height: Math.floor(prepared.height * 0.13),
      } });
      let numberText = number.data.text.trim();
      if (!/\d\s*[/／]\s*\d/.test(numberText)) {
        // Small WotC collector numbers get lost among the copyright/flavour text.
        // A single-line pass of each bottom corner also covers modern left-side numbers.
        await worker.setParameters({ tessedit_pageseg_mode: '7' as import('tesseract.js').PSM, tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ/ ' });
        for (const [left, width] of [[0.79, 0.19], [0.025, 0.45]]) {
          if (disposed) throw new Error('Scanner closed');
          const focused = await worker.recognize(prepared, { rectangle: {
            left: Math.round(prepared.width * left), top: Math.round(prepared.height * 0.94),
            width: Math.round(prepared.width * width), height: Math.round(prepared.height * 0.05),
          } });
          numberText += `\n${focused.data.text.trim()}`;
          if (/\d\s*[/／]\s*\d/.test(numberText)) break;
        }
        await worker.setParameters({ tessedit_char_whitelist: '' });
      }
      if (!located.detected) {
        // Non-yellow borders and incomplete edges still get a full-frame fallback.
        // All results remain review drafts; no collection write is made from OCR.
        await worker.setParameters({ tessedit_pageseg_mode: '11' as import('tesseract.js').PSM });
        const full = await worker.recognize(prepared);
        if (!options.numberOnly) nameText += `\n${full.data.text.trim()}`;
        numberText += `\n${full.data.text.trim()}`;
      }
      return { name: nameText.trim(), number: numberText.trim(), detected: located.detected };
    },
    dispose() {
      disposed = true;
      // terminate immediately when ready, including while recognize is still running.
      void pending?.then(worker => worker.terminate()).catch(() => undefined);
    },
  };
}
