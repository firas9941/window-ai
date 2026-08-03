/**
 * Observability — public surface (Phase A, GitHub #48 / tracker #52).
 *
 * Tracing is **opt-in**. With it off — the default — AI calls run exactly as
 * before and nothing is logged or captured. Enable with
 * `localStorage['ai:trace']='1'` (then reload) or, from the DevTools console,
 * `enableAiTracing()` (no reload needed). Services import `traceCall` /
 * `traceStream` / `isTracingEnabled` from here so the console sink is wired up
 * as a side effect when tracing is on.
 *
 * Later phases add more sinks (in-page IndexedDB panel #49, OpenTelemetry #50,
 * Sentry / Langfuse #51). See `.planning/advanced-section/OBSERVABILITY-PLAN.md`.
 */
import { addSink, isTracingEnabled } from './tracer';
import { consoleSink } from './sinks/console';

let installed = false;

/** Register the built-in console sink exactly once (StrictMode-safe). */
export function installDefaultSinks(): void {
  if (installed) return;
  installed = true;
  addSink(consoleSink);
}

/** Turn tracing on for this tab (no reload) and register the console sink. */
export function enableTracing(): void {
  (globalThis as { __AI_TRACE__?: boolean }).__AI_TRACE__ = true;
  installDefaultSinks();
}

/** Turn tracing off for this tab. */
export function disableTracing(): void {
  (globalThis as { __AI_TRACE__?: boolean }).__AI_TRACE__ = false;
}

if (isTracingEnabled()) {
  installDefaultSinks();
}

// DevTools convenience: flip tracing from the console with no import or reload.
(globalThis as { enableAiTracing?: () => void }).enableAiTracing = enableTracing;
(globalThis as { disableAiTracing?: () => void }).disableAiTracing = disableTracing;

export { addSink, isTracingEnabled, traceCall, traceStream } from './tracer';
export { consoleSink, getSpanHistory, clearSpanHistory } from './sinks/console';
export type { AiSpan, AiApi, AiFinish, Sink } from './types';
