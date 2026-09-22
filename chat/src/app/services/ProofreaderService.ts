// Ambient types for the Proofreader API (Chrome origin trial 141–145; now behind
// chrome://flags/#proofreader-api on Canary).
// These declarations are local to this module so the webpack/babel compilation
// can resolve them. The canonical authoritative types live in dom-chromium-ai.d.ts.
declare global {
  type ProofreaderCorrectionType =
    | 'spelling'
    | 'punctuation'
    | 'capitalization'
    | 'preposition'
    | 'missing-words'
    | 'grammar';

  interface ProofreaderCorrection {
    startIndex: number;
    endIndex: number;
    correction: string;
    types?: ProofreaderCorrectionType[];
    explanation?: string;
  }

  interface ProofreadResult {
    correctedInput: string;
    corrections: ProofreaderCorrection[];
  }

  interface AICreateMonitor {
    addEventListener: (type: string, listener: (e: ProgressEvent) => void) => void;
  }

  interface ProofreaderCreateOptions {
    includeCorrectionTypes?: boolean;
    includeCorrectionExplanations?: boolean;
    correctionExplanationLanguage?: string;
    expectedInputLanguages?: string[];
    signal?: AbortSignal;
    monitor?: (m: AICreateMonitor) => void;
  }

  interface ProofreaderProofreadOptions {
    signal?: AbortSignal;
  }

  interface Proofreader {
    proofread(input: string, options?: ProofreaderProofreadOptions): Promise<ProofreadResult>;
    destroy(): void;
    readonly includeCorrectionTypes: boolean;
    readonly includeCorrectionExplanations: boolean;
    readonly expectedInputLanguages: ReadonlyArray<string> | null;
    readonly correctionExplanationLanguage: string | null;
  }

  interface ProofreaderConstructor {
    create(options?: ProofreaderCreateOptions): Promise<Proofreader>;
    availability(options?: {
      expectedInputLanguages?: string[];
    }): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  }

  interface Window {
    Proofreader: ProofreaderConstructor;
  }
}

/** Language codes the Proofreader demo offers. */
export type ProofreaderLanguageCode = 'en' | 'es' | 'ja' | 'de' | 'fr';

/** Human-readable labels for the supported language codes. */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ code: ProofreaderLanguageCode; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'ja', label: 'Japanese' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
];

/** localStorage key for persisting the user's selected proofreader language. */
export const LOCAL_STORAGE_KEY = 'window-ai.proofreader.language';

/** Module-scope session pool keyed by language code. NOT exported — use the module functions. */
const sessionPool = new Map<string, Promise<Proofreader>>();

/**
 * Create a Proofreader session.
 *
 * Chrome's current build does NOT honor includeCorrectionTypes /
 * includeCorrectionExplanations / correctionExplanationLanguage — passing them
 * makes create() reject with NotSupportedError, which is what broke proofreading
 * on Canary. We try the richer options first (so per-type badges and explanations
 * light up automatically if/when Chrome ships support), then fall back to the
 * minimal supported set. See https://developer.chrome.com/docs/ai/proofreader-api
 */
async function createSession(
  language: ProofreaderLanguageCode,
  monitor?: (m: AICreateMonitor) => void
): Promise<Proofreader> {
  const supported: ProofreaderCreateOptions = { expectedInputLanguages: [language] };
  if (monitor) {
    supported.monitor = monitor;
  }
  try {
    return await window.Proofreader.create({
      ...supported,
      includeCorrectionTypes: true,
      includeCorrectionExplanations: true,
      correctionExplanationLanguage: 'en',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotSupportedError') {
      // Retry with only the options the current Chrome build accepts.
      return window.Proofreader.create(supported);
    }
    throw err;
  }
}

/** Returns a cached session for the given language, or creates and caches a new one. */
function getOrCreateSession(language: ProofreaderLanguageCode): Promise<Proofreader> {
  const cached = sessionPool.get(language);
  if (cached) {
    return cached;
  }
  const promise = createSession(language).catch((err: unknown) => {
    // Remove failed entry so the next call retries cleanly.
    sessionPool.delete(language);
    throw err;
  });
  // Store the promise BEFORE awaiting so concurrent callers share the same in-flight create.
  sessionPool.set(language, promise);
  return promise;
}

/**
 * Proofread text using a pooled Proofreader session for the given language.
 * Wraps known DOMException names into descriptive Error instances.
 */
export const proofread = async (
  text: string,
  opts?: { language?: ProofreaderLanguageCode; signal?: AbortSignal }
): Promise<ProofreadResult> => {
  const language: ProofreaderLanguageCode = opts?.language ?? 'en';
  try {
    const session = await getOrCreateSession(language);
    return await session.proofread(text, { signal: opts?.signal });
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'AbortError') {
        throw new Error('Proofreading was aborted');
      }
      if (error.name === 'QuotaExceededError') {
        throw new Error('Proofreading failed: input exceeds quota');
      }
      if (error.name === 'NotSupportedError') {
        throw new Error('Proofreading is not supported with these options');
      }
    }
    throw error;
  }
};

/**
 * Returns the availability of the Proofreader API for the given language.
 * Returns 'unavailable' immediately when the API is not present in the runtime.
 */
export const getAvailability = async (
  language?: ProofreaderLanguageCode
): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'> => {
  if (typeof window === 'undefined' || typeof window.Proofreader === 'undefined') {
    return 'unavailable';
  }
  return window.Proofreader.availability({ expectedInputLanguages: [language ?? 'en'] });
};

/**
 * Creates a Proofreader session with download-progress reporting, then stores it
 * in the session pool so subsequent proofread() calls reuse it.
 */
export const createWithProgress = async (
  language: ProofreaderLanguageCode,
  onProgress: (pct: number) => void
): Promise<Proofreader> => {
  const promise = createSession(language, (m: AICreateMonitor) => {
    m.addEventListener('downloadprogress', (e: ProgressEvent) => {
      onProgress(e.loaded != null ? e.loaded * 100 : 0);
    });
  });
  // Store in pool before awaiting so proofread() reuses this session.
  sessionPool.set(language, promise);
  return promise;
};

/**
 * Destroys all cached Proofreader sessions and empties the pool.
 * Call on page unmount to release model resources.
 */
export const destroyAllSessions = (): void => {
  for (const promise of sessionPool.values()) {
    // Intentionally swallow errors — destroy is best-effort cleanup on unmount.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    promise.then((p) => p.destroy()).catch(() => {});
  }
  sessionPool.clear();
};
