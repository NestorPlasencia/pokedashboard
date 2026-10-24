import { buildCardVectorIndex, cardVectorFileName, type CardVectorFile, type CardVectorIndex } from '../utils/visualMatch';

const files = new Map<string, Promise<CardVectorFile | null>>();

/** A series without vectors is simply left to OCR. */
const loadSeriesVectors = (series: string) => {
  if (!files.has(series)) {
    files.set(series, fetch(`/card-vectors/v1/${cardVectorFileName(series)}`)
      .then(async response => {
        // The dev server answers unknown paths with index.html, so check the type too.
        if (!response.ok || !response.headers.get('content-type')?.includes('json')) return null;
        return await response.json() as CardVectorFile;
      })
      .catch(() => { files.delete(series); return null; }));
  }
  return files.get(series)!;
};

export async function loadCardVectors(series: string[]): Promise<CardVectorIndex | null> {
  const loaded = await Promise.all([...new Set(series)].sort().map(loadSeriesVectors));
  return buildCardVectorIndex(loaded.filter((file): file is CardVectorFile => Boolean(file)));
}

type Transformers = typeof import('@huggingface/transformers');

/**
 * The pretrained image model the vectors were made with. It runs on this device: the photo
 * is never uploaded. The model downloads once (about 24 MB) and stays in the browser cache.
 */
export function createCardEmbedder(model: string, onProgress: (message: string) => void) {
  let disposed = false;
  let pending: Promise<{ library: Transformers; processor: Awaited<ReturnType<Transformers['AutoProcessor']['from_pretrained']>>; network: Awaited<ReturnType<Transformers['AutoModel']['from_pretrained']>> }> | null = null;
  const load = () => {
    if (disposed) throw new Error('Scanner closed');
    pending ??= import('@huggingface/transformers').then(async library => {
      // Without this the library first asks our own origin for /models/…
      library.env.allowLocalModels = false;
      const progress_callback = (event: { status: string; progress?: number }) => {
        if (!disposed && event.status === 'progress' && event.progress !== undefined) {
          onProgress(`Descargando reconocimiento por imagen… ${Math.round(event.progress)}%`);
        }
      };
      const [processor, network] = await Promise.all([
        library.AutoProcessor.from_pretrained(model, { progress_callback }),
        library.AutoModel.from_pretrained(model, { dtype: 'q8', progress_callback }),
      ]);
      if (disposed) { await network.dispose(); throw new Error('Scanner closed'); }
      return { library, processor, network };
    }).catch(error => { pending = null; throw error; });
    return pending;
  };

  return {
    async embed(image: HTMLCanvasElement): Promise<Float32Array> {
      const { library, processor, network } = await load();
      const { last_hidden_state: state } = await network(await processor(library.RawImage.fromCanvas(image)));
      // The class token summarises the whole image.
      const vector = Float32Array.from((state.data as Float32Array).subarray(0, state.dims[2]));
      const norm = Math.hypot(...vector) || 1;
      return vector.map(value => value / norm);
    },
    dispose() {
      disposed = true;
      void pending?.then(({ network }) => network.dispose()).catch(() => undefined);
    },
  };
}
