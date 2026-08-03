import React, { useEffect, useState } from 'react';
import { addSink, traceStream, type AiSpan } from '../../services/observability';
import { MissingFlagBanner } from '../MissingFlagBanner';
import { RunControls, type DemoApi } from './RunControls';
import { SpanViews } from './SpanViews';

const PRESETS: Record<DemoApi, string> = {
  summarizer:
    'Chrome ships several built-in AI APIs that run entirely on-device using Gemini Nano. Because inference happens locally, there is no server round-trip to instrument, no per-request cost, and no data leaves the machine. Developers can prompt, summarize, translate, write, and proofread without any backend.',
  translator: 'On-device AI keeps your data on your machine — no server, no API key, no cost.',
  prompt: 'In one sentence, explain why on-device AI is good for privacy.',
};

const opFor = (api: DemoApi): string =>
  api === 'summarizer' ? 'summarize' : api === 'translator' ? 'translate' : 'prompt';

const uid = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">
    <span className="text-gray-400 dark:text-gray-500">{label}</span>
    {value}
  </span>
);

export const TraceDemo: React.FC = () => {
  const [api, setApi] = useState<DemoApi>('summarizer');
  const [input, setInput] = useState<string>(PRESETS.summarizer);
  const [running, setRunning] = useState(false);
  const [spans, setSpans] = useState<AiSpan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [availability, setAvailability] = useState<string | null>(null);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const [promptUnavailable, setPromptUnavailable] = useState(false);

  // Prompt (Gemini Nano) needs Canary / flags on stable — check when selected.
  useEffect(() => {
    let cancelled = false;
    if (api !== 'prompt') {
      setPromptUnavailable(false);
      return;
    }
    (async () => {
      try {
        const availability = await LanguageModel.availability({ outputLanguage: 'en' });
        if (!cancelled) setPromptUnavailable(availability === 'unavailable');
      } catch {
        if (!cancelled) setPromptUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const onApiChange = (next: DemoApi) => {
    setApi(next);
    setInput(PRESETS[next]);
    setOutput('');
  };

  const run = async () => {
    setRunning(true);
    setOutput('');
    setAvailability(null);
    setDownloadPct(null);

    // Signals captured at create() time (before the stream trace).
    let seenAvailability: string | undefined;
    let seenDownloadPct: number | undefined;
    const monitor = (m: AICreateMonitor) => {
      m.addEventListener('downloadprogress', (e: ProgressEvent) => {
        const pct = Math.round(e.loaded * 100);
        seenDownloadPct = pct;
        setDownloadPct(pct);
      });
    };

    // One-shot sink: capture this run's span so we can enrich it with the
    // create-time signals (availability + download progress) before rendering.
    let captured: AiSpan | undefined;
    const off = addSink((span) => {
      captured = span;
    });

    try {
      let stream: ReadableStream<string>;
      if (api === 'summarizer') {
        seenAvailability = await window.Summarizer.availability({ outputLanguage: 'en' });
        setAvailability(seenAvailability ?? null);
        const s = await window.Summarizer.create({
          type: 'key-points',
          format: 'plain-text',
          outputLanguage: 'en',
          monitor,
        });
        stream = traceStream('summarizer', 'summarize', s, () => s.summarizeStreaming(input));
      } else if (api === 'translator') {
        seenAvailability = await window.Translator.availability({
          sourceLanguage: 'en',
          targetLanguage: 'es',
        });
        setAvailability(seenAvailability ?? null);
        const t = await window.Translator.create({
          sourceLanguage: 'en',
          targetLanguage: 'es',
          monitor,
        });
        stream = traceStream('translator', 'translate', t, () => t.translateStreaming(input));
      } else {
        seenAvailability = await LanguageModel.availability({ outputLanguage: 'en' });
        setAvailability(seenAvailability ?? null);
        const s = await LanguageModel.create({ outputLanguage: 'en', monitor });
        stream = traceStream('prompt', 'prompt', s, () => s.promptStreaming(input));
      }

      const reader = stream.getReader();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += value;
        setOutput(text);
      }
    } catch (e) {
      // create() can fail before the tracer wraps the stream (e.g. the Prompt API
      // is not executable on stable Chrome). Synthesize an error span so the demo
      // also shows what error observability looks like.
      captured = {
        id: uid(),
        ts: Date.now(),
        api,
        op: opFor(api),
        stream: true,
        latencyMs: 0,
        finish: 'error',
        errorName: (e as { name?: string })?.name,
      };
    } finally {
      off();
      if (captured) {
        const enriched: AiSpan = {
          ...captured,
          availability: seenAvailability,
          downloadPct: seenDownloadPct,
        };
        setSpans((prev) => [enriched, ...prev].slice(0, 12));
        setSelectedId(enriched.id);
      }
      setRunning(false);
    }
  };

  const selected = spans.find((s) => s.id === selectedId) ?? spans[0];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left: controls + model output */}
      <div className="space-y-4">
        {promptUnavailable && (
          <MissingFlagBanner
            title="The Prompt API isn't available in this browser."
            body="Summarizer and Translator still work here. To trace the Prompt API (Gemini Nano), use Chrome Canary or enable the flags below, then relaunch."
            flags={[
              {
                name: 'Prompt API',
                url: 'chrome://flags/#prompt-api-for-gemini-nano',
                note: 'set to "Enabled"',
              },
              {
                name: 'On-device model',
                url: 'chrome://flags/#optimization-guide-on-device-model',
                note: 'set to "Enabled BypassPerfRequirement"',
              },
            ]}
            browserRequirement="Chrome Canary (desktop)"
          />
        )}

        <RunControls
          api={api}
          onApiChange={onApiChange}
          input={input}
          onInputChange={setInput}
          onRun={run}
          running={running}
        />

        {(availability || downloadPct != null) && (
          <div className="space-y-1 text-xs">
            {availability && (
              <p className="text-gray-500 dark:text-gray-400">
                <code className="font-mono">availability()</code> →{' '}
                <span className="font-medium text-gray-700 dark:text-gray-200">{availability}</span>
              </p>
            )}
            {downloadPct != null && (
              <div>
                <p className="text-gray-500 dark:text-gray-400">
                  <code className="font-mono">monitor(m)</code> → <code className="font-mono">downloadprogress</code>{' '}
                  {downloadPct}%
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${downloadPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {output && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Model output
            </p>
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-800 dark:bg-gray-700 dark:text-gray-200">
              {output}
            </p>
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          On-device inference exposes no logprobs, confidence, or model version — the trace below is
          built from the signals Chrome <em>does</em> give you. Nothing leaves the browser.
        </p>
      </div>

      {/* Right: the captured trace */}
      <div className="space-y-4">
        {selected ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Stat label="latency" value={`${Math.round(selected.latencyMs)}ms`} />
              {selected.ttftMs != null && (
                <Stat label="ttft" value={`${Math.round(selected.ttftMs)}ms`} />
              )}
              {selected.outChars != null && (
                <Stat label="chars" value={String(selected.outChars)} />
              )}
              {selected.contextUsage != null && (
                <Stat
                  label="context"
                  value={`${selected.contextUsage}${
                    selected.contextWindow != null ? `/${selected.contextWindow}` : ''
                  }`}
                />
              )}
              <Stat label="finish" value={selected.finish} />
            </div>
            <SpanViews span={selected} />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Run a call to capture a trace. The span is built entirely in your browser — see the same
            trace as a <code>console.log</code>, a structured object, and OpenTelemetry attributes.
          </div>
        )}

        {spans.length > 1 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Recent runs
            </p>
            <ul className="space-y-1">
              {spans.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full rounded px-2 py-1 text-left font-mono text-xs ${
                      s.id === selected?.id
                        ? 'bg-primary-50 dark:bg-primary-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {s.api}.{s.op} · {Math.round(s.latencyMs)}ms · {s.finish}
                    {s.errorName ? ` (${s.errorName})` : ''}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default TraceDemo;
