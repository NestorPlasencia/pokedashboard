// Precomputes image vectors for the scanner's visual matching.
//
//   node scripts/build-card-vectors.mjs Base Gym
//
// Card images live on other domains that do not allow pages to read their pixels, so the
// vectors are made here, where CORS does not apply. No image is stored: only one vector per
// image URL, from the same pretrained model the scanner loads in the browser. Nothing is
// trained. Re-run for a series when it gains sets.
import { AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers';
import { mkdir, writeFile } from 'node:fs/promises';

const API = process.env.POKE_DB_API_URL || 'https://poke-db-git-master-nestorplasencias-projects.vercel.app/api';
const MODEL = 'Xenova/dinov2-small';
const OUT = new URL('../public/card-vectors/v1/', import.meta.url);
const CONCURRENCY = 6;

const slug = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const getJson = async url => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

const requested = process.argv.slice(2);
if (!requested.length) {
  console.error('Usage: node scripts/build-card-vectors.mjs <series name> [...]');
  process.exit(1);
}
const hierarchy = await getJson(`${API}/navigation/cards-hierarchy`);
const series = requested.map(name => {
  const match = hierarchy.find(entry => entry.name.toLowerCase() === name.toLowerCase());
  if (!match) throw new Error(`Unknown series "${name}". Known: ${hierarchy.map(entry => entry.name).join(', ')}`);
  return match;
});

const processor = await AutoProcessor.from_pretrained(MODEL);
const model = await AutoModel.from_pretrained(MODEL, { dtype: 'q8' });
await mkdir(OUT, { recursive: true });

for (const serie of series) {
  const { items } = await getJson(`${API}/cards?seriesId=${serie.id}`);
  const images = [...new Set(items.map(card => card.image).filter(Boolean))];
  const vectors = new Map();
  const failed = [];
  const queue = [...images];
  const started = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const { last_hidden_state: state } = await model(await processor(await RawImage.fromURL(url)));
        vectors.set(url, Float32Array.from(state.data.slice(0, state.dims[2])));
      } catch (error) {
        failed.push(url);
        console.warn(`  skipped ${url}: ${String(error).slice(0, 80)}`);
      }
    }
  }));

  // int8 with one scale per vector: a quarter of float32, and no measurable ranking change.
  const kept = images.filter(url => vectors.has(url));
  const dims = vectors.get(kept[0])?.length ?? 0;
  const quantized = new Int8Array(kept.length * dims);
  const scales = new Float32Array(kept.length);
  kept.forEach((url, row) => {
    const vector = vectors.get(url);
    const norm = Math.hypot(...vector) || 1;
    const max = Math.max(...vector.map(Math.abs)) / norm || 1;
    scales[row] = max / 127;
    vector.forEach((value, column) => { quantized[row * dims + column] = Math.round(value / norm / max * 127); });
  });
  const file = {
    version: 1, model: MODEL, dims, series: serie.name, generatedAt: new Date().toISOString(),
    images: kept,
    scales: Buffer.from(scales.buffer).toString('base64'),
    vectors: Buffer.from(quantized.buffer).toString('base64'),
  };
  await writeFile(new URL(`${slug(serie.name)}.json`, OUT), JSON.stringify(file));
  console.log(`${serie.name}: ${kept.length} images, ${failed.length} skipped, ${Math.round((Date.now() - started) / 1000)}s`);
}
