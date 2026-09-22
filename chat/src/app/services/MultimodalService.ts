/** Module-scope single session promise — lazy-initialized on first promptWithImage call. */
let sessionPromise: Promise<LanguageModel> | null = null;

/**
 * Local interface for a LanguageModel that accepts array-based multimodal input.
 * dom-chromium-ai.d.ts declares only the string overload (line 63) — do NOT modify that file.
 * This local cast is the same workaround pattern ChatAIService.ts uses for params().
 * We do NOT extend LanguageModel directly to avoid TS2430 (incompatible overload).
 */
interface MultimodalLanguageModel {
  promptStreaming(
    input: Array<{ role: string; content: Array<{ type: string; value: unknown }> }>,
    options?: { signal?: AbortSignal }
  ): ReadableStream<string>;
  destroy(): void;
}

/** Returns a cached session, or creates and caches a new one (stores promise before awaiting). */
function getOrCreateSession(): Promise<LanguageModel> {
  if (sessionPromise) return sessionPromise;
  sessionPromise = LanguageModel.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  }).catch((err: unknown) => {
    // Remove failed promise so the next call retries cleanly.
    sessionPromise = null;
    throw err;
  });
  // Store promise BEFORE awaiting so concurrent callers share the same in-flight create.
  return sessionPromise;
}

/** Availability state union — mirrors the Chrome API return values. */
export type AvailabilityState = 'available' | 'downloadable' | 'downloading' | 'unavailable';

/**
 * Local helper type for multimodal content parts.
 * Kept inside this module only — do NOT add to dom-chromium-ai.d.ts.
 */
export interface MultimodalContentPart {
  type: 'text' | 'image' | 'audio';
  value: string | Blob | ImageBitmap;
}

/**
 * Prompts the model with a text question and an image (Blob or ImageBitmap).
 * Returns a ReadableStream<string> of incremental text chunks.
 */
export async function promptWithImage(
  text: string,
  image: Blob | ImageBitmap,
  opts?: { signal?: AbortSignal }
): Promise<ReadableStream<string>> {
  const session = (await getOrCreateSession()) as unknown as MultimodalLanguageModel;
  return session.promptStreaming(
    [{ role: 'user', content: [{ type: 'text', value: text }, { type: 'image', value: image }] }],
    { signal: opts?.signal }
  );
}

/**
 * Returns the availability of multimodal image input.
 * Returns 'unavailable' immediately when LanguageModel is absent or options throw
 * (older Canary builds that predate the expectedInputs overload — Pitfall 3).
 */
export const getAvailability = async (): Promise<AvailabilityState> => {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return (await LanguageModel.availability({
      expectedInputs: [{ type: 'image' }],
    })) as AvailabilityState;
  } catch {
    return 'unavailable';
  }
};

// ---------------------------------------------------------------------------
// Audio input (Prompt API text + audio). Kept on its OWN session and
// availability check so audio's GPU requirement never gates image-only use.
// ---------------------------------------------------------------------------

/** Module-scope audio session — lazy-initialized on first promptWithAudio call. */
let audioSessionPromise: Promise<LanguageModel> | null = null;

function getOrCreateAudioSession(): Promise<LanguageModel> {
  if (audioSessionPromise) return audioSessionPromise;
  audioSessionPromise = LanguageModel.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'audio' }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  }).catch((err: unknown) => {
    // Remove failed promise so the next call retries cleanly.
    audioSessionPromise = null;
    throw err;
  });
  return audioSessionPromise;
}

/**
 * Prompts the model with a text question and an audio clip (Blob).
 * Audio input requires a GPU. Returns a ReadableStream<string> of text chunks.
 */
export async function promptWithAudio(
  text: string,
  audio: Blob,
  opts?: { signal?: AbortSignal }
): Promise<ReadableStream<string>> {
  const session = (await getOrCreateAudioSession()) as unknown as MultimodalLanguageModel;
  return session.promptStreaming(
    [{ role: 'user', content: [{ type: 'text', value: text }, { type: 'audio', value: audio }] }],
    { signal: opts?.signal }
  );
}

/**
 * Returns the availability of audio input (separate from image; requires a GPU).
 * Returns 'unavailable' when LanguageModel is absent or the options throw.
 */
export const getAudioAvailability = async (): Promise<AvailabilityState> => {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return (await LanguageModel.availability({
      expectedInputs: [{ type: 'audio' }],
    })) as AvailabilityState;
  } catch {
    return 'unavailable';
  }
};

/**
 * Creates a LanguageModel session with download-progress reporting, then stores it
 * in the module-scope pool so subsequent promptWithImage calls reuse it.
 *
 * CR-02 fix: chain a .catch() that clears sessionPromise on failure, mirroring
 * getOrCreateSession. Without this, a failed download permanently poisons
 * sessionPromise — every subsequent getOrCreateSession() call returns the same
 * rejected promise until the page reloads.
 */
export const createWithProgress = async (
  onProgress: (pct: number) => void
): Promise<LanguageModel> => {
  const promise = LanguageModel.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
    monitor(m: AICreateMonitor) {
      m.addEventListener('downloadprogress', (e: ProgressEvent) => {
        onProgress(e.loaded != null ? e.loaded * 100 : 0);
      });
    },
  }).catch((err: unknown) => {
    // Allow retry on failure — same pattern as getOrCreateSession.
    sessionPromise = null;
    throw err;
  });
  sessionPromise = promise;
  return promise;
};

/**
 * Destroys the cached LanguageModel session and empties the pool.
 * Call on page unmount to release model resources.
 */
export const destroyAllSessions = (): void => {
  for (const s of [sessionPromise, audioSessionPromise]) {
    // Intentionally swallow errors — destroy is best-effort cleanup on unmount.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    s?.then((session) => session.destroy()).catch(() => {});
  }
  sessionPromise = null;
  audioSessionPromise = null;
};
