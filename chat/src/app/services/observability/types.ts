/**
 * Observability — Phase A (GitHub #48, tracker #52).
 *
 * A single normalized record for one on-device AI call, plus the sink contract.
 * Everything here is client-side only; nothing leaves the device. On-device
 * inference exposes no logprobs, no confidence (except LanguageDetector), no
 * output-token count and no model version, so an `AiSpan` only carries the
 * signals Chrome actually gives us.
 *
 * Full plan: `.planning/advanced-section/OBSERVABILITY-PLAN.md`.
 */

/** Which built-in AI surface produced the span. */
export type AiApi =
  | 'prompt'
  | 'summarizer'
  | 'translator'
  | 'languageDetector'
  | 'writer'
  | 'rewriter'
  | 'proofreader'
  | 'embeddings';

/** Terminal state of a traced call. */
export type AiFinish = 'ok' | 'error' | 'abort';

/** One traced on-device AI call. */
export interface AiSpan {
  /** Unique id (crypto.randomUUID, with a fallback). */
  id: string;
  /** Wall-clock start time (Date.now()). */
  ts: number;
  api: AiApi;
  /** Operation name, e.g. 'prompt' | 'summarize' | 'translate'. */
  op: string;
  stream: boolean;
  /** Wall-clock duration of the awaited call, in ms. */
  latencyMs: number;
  /** Streaming only: time to first chunk, in ms. */
  ttftMs?: number;
  /** Output size as a character count — a proxy, NOT a token count. */
  outChars?: number;
  /** Prompt API `session.contextUsage` (read drift-safe against `inputUsage`). */
  contextUsage?: number;
  /** Prompt API `session.contextWindow` (drift-safe against `inputQuota`). */
  contextWindow?: number;
  finish: AiFinish;
  /** DOMException name on failure, e.g. 'QuotaExceededError' | 'AbortError'. */
  errorName?: string;

  // --- populated by later phases (kept optional so the shape is stable) ---
  /** `availability()` state captured before create(). */
  availability?: string;
  /** Last `downloadprogress` value (0–100). */
  downloadPct?: number;
  /** LanguageDetector confidence — the only genuine confidence signal. */
  confidence?: number;
}

/** A trace consumer. Registered via `addSink`. Implementations must not throw. */
export type Sink = (span: AiSpan) => void;
