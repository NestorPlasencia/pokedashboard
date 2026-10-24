import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const destination = new URL('../public/ocr/v7/', import.meta.url);
await mkdir(destination, { recursive: true });
const core = dirname(require.resolve('tesseract.js-core/package.json'));
for (const file of await readdir(core)) {
  if (file.endsWith('.wasm.js')) await copyFile(join(core, file), new URL(file, destination));
}
await copyFile(require.resolve('tesseract.js/dist/worker.min.js'), new URL('worker.min.js', destination));
await copyFile(require.resolve('tesseract.js/dist/worker.min.js.LICENSE.txt'), new URL('worker.min.js.LICENSE.txt', destination));
await copyFile(require.resolve('tesseract.js/LICENSE.md'), new URL('tesseract-LICENSE.md', destination));
await copyFile(join(core, 'LICENSE'), new URL('tesseract-core-LICENSE.txt', destination));
for (const language of ['eng', 'spa']) {
  const root = dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
  await copyFile(join(root, '4.0.0_best_int', `${language}.traineddata.gz`), new URL(`${language}.traineddata.gz`, destination));
}
console.log('Browser OCR assets prepared in public/ocr/v7.');
