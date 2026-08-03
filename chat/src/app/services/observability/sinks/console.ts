/**
 * Console sink — Phase A debug baseline (GitHub #48).
 *
 * The simplest possible observability: log every span and keep a rolling
 * in-memory history you can inspect at any time with
 * `console.table(window.__AI_SPANS__)`.
 */
import type { AiSpan, Sink } from '../types';

const MAX = 200;
const history: AiSpan[] = [];

/** Compact projection used for the per-call `console.table` row. */
function toRow(s: AiSpan) {
  return {
    api: s.api,
    op: s.op,
    ms: Math.round(s.latencyMs),
    ttft: s.ttftMs != null ? Math.round(s.ttftMs) : undefined,
    outChars: s.outChars,
    ctx:
      s.contextUsage != null && s.contextWindow != null
        ? `${s.contextUsage}/${s.contextWindow}`
        : undefined,
    finish: s.finish,
    error: s.errorName,
  };
}

/** Logs each span and appends it to a globally-inspectable history buffer. */
export const consoleSink: Sink = (span) => {
  history.push(span);
  if (history.length > MAX) history.shift();
  (globalThis as { __AI_SPANS__?: AiSpan[] }).__AI_SPANS__ = history;

  const ttft = span.ttftMs != null ? ` · ttft ${Math.round(span.ttftMs)}ms` : '';
  console.debug(
    `%c[ai]%c ${span.api}.${span.op} · ${Math.round(span.latencyMs)}ms${ttft} · ${span.finish}`,
    'color:#977DFF;font-weight:600',
    'color:inherit',
    span,
  );
  console.table([toRow(span)]);
};

/** All spans captured this session (most recent last). */
export const getSpanHistory = (): readonly AiSpan[] => history;

/** Clear the in-memory history buffer. */
export const clearSpanHistory = (): void => {
  history.length = 0;
};
