import React, { useState } from 'react';
import type { AiSpan } from '../../services/observability';

type View = 'console' | 'structured' | 'otel';

const round = (n?: number): number | undefined => (n == null ? undefined : Math.round(n));

/** A clean structured projection of the span (undefined fields dropped). */
function structured(span: AiSpan): Record<string, unknown> {
  const out: Record<string, unknown> = {
    api: span.api,
    op: span.op,
    stream: span.stream,
    latencyMs: round(span.latencyMs),
    finish: span.finish,
  };
  if (span.ttftMs != null) out.ttftMs = round(span.ttftMs);
  if (span.outChars != null) out.outChars = span.outChars;
  if (span.contextUsage != null) out.contextUsage = span.contextUsage;
  if (span.contextWindow != null) out.contextWindow = span.contextWindow;
  if (span.availability) out.availability = span.availability;
  if (span.downloadPct != null) out.downloadPct = span.downloadPct;
  if (span.errorName) out.errorName = span.errorName;
  return out;
}

/**
 * OpenTelemetry GenAI semantic-convention mapping (illustrative). On-device calls
 * are INTERNAL spans; input_tokens is approximate (cumulative session usage).
 */
function genAi(span: AiSpan): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    'gen_ai.operation.name': span.op,
    'gen_ai.provider.name': 'chrome.builtin',
    'gen_ai.request.model': 'gemini-nano',
    'gen_ai.request.stream': span.stream,
    'gen_ai.response.finish_reasons': [span.finish],
  };
  if (span.ttftMs != null) {
    attributes['gen_ai.response.time_to_first_chunk'] = Number((span.ttftMs / 1000).toFixed(3));
  }
  if (span.contextUsage != null) attributes['gen_ai.usage.input_tokens'] = span.contextUsage;
  if (span.errorName) attributes['error.type'] = span.errorName;
  return { name: `gen_ai.${span.op}`, kind: 'INTERNAL', attributes };
}

function consoleText(span: AiSpan): string {
  const ttft = span.ttftMs != null ? ` · ttft ${round(span.ttftMs)}ms` : '';
  const head = `[ai] ${span.api}.${span.op} · ${round(span.latencyMs)}ms${ttft} · ${span.finish}`;
  return `console.log(\n  '${head}',\n  ${JSON.stringify(structured(span))}\n);`;
}

const VIEWS: { id: View; label: string }[] = [
  { id: 'console', label: 'console.log' },
  { id: 'structured', label: 'AiSpan' },
  { id: 'otel', label: 'OpenTelemetry gen_ai.*' },
];

export const SpanViews: React.FC<{ span: AiSpan }> = ({ span }) => {
  const [view, setView] = useState<View>('console');
  const body =
    view === 'console'
      ? consoleText(span)
      : view === 'structured'
        ? JSON.stringify(structured(span), null, 2)
        : JSON.stringify(genAi(span), null, 2);

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              view === v.id
                ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
        <code>{body}</code>
      </pre>
    </div>
  );
};

export default SpanViews;
