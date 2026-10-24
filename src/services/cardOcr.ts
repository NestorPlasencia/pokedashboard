import type { Worker } from 'tesseract.js';

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
    async recognize(image: HTMLCanvasElement) {
      const worker = await getWorker();
      // Upscaling and grayscale improve the small collector number on older cards.
      const prepared = document.createElement('canvas');
      prepared.width = 1100;
      prepared.height = Math.round(image.height * prepared.width / image.width);
      const context = prepared.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      context.filter = 'grayscale(1) contrast(1.25)';
      context.drawImage(image, 0, 0, prepared.width, prepared.height);
      await worker.setParameters({ tessedit_pageseg_mode: '11' as import('tesseract.js').PSM });
      const name = await worker.recognize(prepared, { rectangle: {
        left: Math.round(prepared.width * 0.05), top: Math.round(prepared.height * 0.025),
        width: Math.round(prepared.width * 0.9), height: Math.round(prepared.height * 0.14),
      } });
      if (disposed) throw new Error('Scanner closed');
      const number = await worker.recognize(prepared, { rectangle: {
        left: Math.round(prepared.width * 0.04), top: Math.floor(prepared.height * 0.86),
        width: Math.round(prepared.width * 0.92), height: Math.floor(prepared.height * 0.13),
      } });
      let numberText = number.data.text.trim();
      if (!/\d\s*[/／]\s*\d/.test(numberText)) {
        // Small WotC collector numbers get lost among the copyright/flavour text.
        // A single-line pass of each bottom corner also covers modern left-side numbers.
        await worker.setParameters({ tessedit_pageseg_mode: '7' as import('tesseract.js').PSM });
        for (const [left, width] of [[0.83, 0.14], [0.025, 0.45]]) {
          if (disposed) throw new Error('Scanner closed');
          const focused = await worker.recognize(prepared, { rectangle: {
            left: Math.round(prepared.width * left), top: Math.round(prepared.height * 0.947),
            width: Math.round(prepared.width * width), height: Math.round(prepared.height * 0.037),
          } });
          numberText += `\n${focused.data.text.trim()}`;
          if (/\d\s*[/／]\s*\d/.test(numberText)) break;
        }
      }
      return { name: name.data.text.trim(), number: numberText.trim() };
    },
    dispose() {
      disposed = true;
      // terminate immediately when ready, including while recognize is still running.
      void pending?.then(worker => worker.terminate()).catch(() => undefined);
    },
  };
}
