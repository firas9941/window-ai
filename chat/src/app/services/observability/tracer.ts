/**
 * Observability tracer — Phase A (GitHub #48).
 *
 * Wraps a Chrome built-in AI call and emits a normalized {@link AiSpan} to every
 * registered {@link Sink}. Two entry points:
 *   - {@link traceCall}   for one-shot calls returning a Promise.
 *   - {@link traceStream} for streaming calls returning a ReadableStream — the
 *     returned stream is a pass-through, so callers still render incrementally;
 *     the span is emitted when the stream ends, errors, or is cancelled.
 *
 * Tracing is opt-in (see {@link isTracingEnabled}) so production visitors incur
 * zero overhead and nothing is logged unless a developer turns it on.
 */
import type { AiApi, AiFinish, AiSpan, Sink } from './types';

const sinks: Sink[] = [];

/** Register a trace sink. Returns an unsubscribe function. */
export function addSink(sink: Sink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

function emit(span: AiSpan): void {
  for (const sink of sinks) {
    try {
      sink(span);
    } catch {
      /* a misbehaving sink must never break the traced call */
    }
  }
}

/**
 * Whether tracing is active. **Opt-in only** (off by default) so production —
 * and normal dev — behavior is completely untouched: no wrapping of AI calls,
 * nothing logged, nothing captured. Enable with `localStorage['ai:trace'] = '1'`
 * (then reload) or `globalThis.__AI_TRACE__ = true` (or call `enableTracing()`).
 */
export function isTracingEnabled(): boolean {
  const g = globalThis as { __AI_TRACE__?: boolean };
  if (typeof g.__AI_TRACE__ === 'boolean') return g.__AI_TRACE__;
  try {
    return localStorage.getItem('ai:trace') === '1';
  } catch {
    /* localStorage can throw in sandboxed / privacy contexts */
    return false;
  }
}

/** Drift-safe view of Prompt API context accounting (context* ?? legacy input*). */
interface ContextUsageLike {
  contextUsage?: number;
  contextWindow?: number;
  inputUsage?: number;
  inputQuota?: number;
}

function readContext(session: unknown): Pick<AiSpan, 'contextUsage' | 'contextWindow'> {
  // Reading accounting getters on a destroyed/invalidated session can throw
  // (InvalidStateError). Trace bookkeeping must never break — or mask — the
  // underlying call, so swallow any failure and just omit the numbers.
  try {
    const s = (session ?? {}) as ContextUsageLike;
    return {
      contextUsage: s.contextUsage ?? s.inputUsage,
      contextWindow: s.contextWindow ?? s.inputQuota,
    };
  } catch {
    return {};
  }
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function newSpan(api: AiApi, op: string, stream: boolean): AiSpan {
  return { id: uid(), ts: Date.now(), api, op, stream, latencyMs: 0, finish: 'ok' };
}

function errorName(e: unknown): string | undefined {
  return (e as { name?: string })?.name;
}

function classify(e: unknown): AiFinish {
  return errorName(e) === 'AbortError' ? 'abort' : 'error';
}

/**
 * Trace a non-streaming on-device call. Times it, emits an {@link AiSpan}, and
 * returns the original result unchanged (errors are recorded then re-thrown).
 */
export async function traceCall<T>(
  api: AiApi,
  op: string,
  session: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const span = newSpan(api, op, false);
  const t0 = performance.now();
  try {
    const result = await run();
    if (typeof result === 'string') span.outChars = result.length;
    return result;
  } catch (e) {
    span.finish = classify(e);
    span.errorName = errorName(e);
    throw e;
  } finally {
    span.latencyMs = performance.now() - t0;
    Object.assign(span, readContext(session));
    emit(span);
  }
}

/**
 * Trace a streaming on-device call. Returns a pass-through ReadableStream so the
 * caller still consumes chunks incrementally; the {@link AiSpan} is emitted once
 * the stream completes, errors, or is cancelled. Captures TTFT + output chars.
 */
export function traceStream(
  api: AiApi,
  op: string,
  session: unknown,
  run: () => ReadableStream<string>,
): ReadableStream<string> {
  const span = newSpan(api, op, true);
  const t0 = performance.now();
  let reader: ReadableStreamDefaultReader<string> | undefined;
  let first = true;
  let chars = 0;
  let finalized = false;

  const finalize = (finish: AiFinish, name?: string): void => {
    if (finalized) return;
    finalized = true;
    span.latencyMs = performance.now() - t0;
    span.outChars = chars;
    span.finish = finish;
    if (name) span.errorName = name;
    Object.assign(span, readContext(session));
    emit(span);
  };

  return new ReadableStream<string>({
    start(controller) {
      try {
        reader = run().getReader();
      } catch (e) {
        finalize(classify(e), errorName(e));
        controller.error(e);
      }
    },
    async pull(controller) {
      if (!reader) return;
      try {
        const { done, value } = await reader.read();
        if (done) {
          finalize('ok');
          controller.close();
          return;
        }
        if (first) {
          span.ttftMs = performance.now() - t0;
          first = false;
        }
        chars += value.length;
        controller.enqueue(value);
      } catch (e) {
        finalize(classify(e), errorName(e));
        controller.error(e);
      }
    },
    cancel(reason) {
      finalize('abort', errorName(reason));
      return reader?.cancel(reason);
    },
  });
}
