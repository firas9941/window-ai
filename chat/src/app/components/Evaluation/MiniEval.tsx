import React, { useEffect, useMemo, useState } from 'react';
import { MissingFlagBanner } from '../MissingFlagBanner';
import { EVAL_CASES, type EvalCase } from './testCases';

type RunStatus = 'pass' | 'fail' | 'error';
interface RunResult {
  index: number;
  status: RunStatus;
  reason?: string;
  output?: string;
}

const RUN_OPTIONS = [5, 8, 10];

const DOT: Record<RunStatus, string> = {
  pass: 'bg-green-500',
  fail: 'bg-red-500',
  error: 'bg-gray-400',
};

/** Create a session for the case and return a callable + destroy. */
async function makeRunner(c: EvalCase): Promise<{ call: () => Promise<string>; destroy: () => void }> {
  if (c.api === 'summarizer') {
    const s = await window.Summarizer.create({
      type: c.summaryType ?? 'tl;dr',
      format: 'plain-text',
      outputLanguage: 'en',
    });
    return { call: () => s.summarize(c.input), destroy: () => s.destroy() };
  }
  if (c.api === 'translator') {
    const t = await window.Translator.create({ sourceLanguage: 'en', targetLanguage: 'es' });
    return { call: () => t.translate(c.input), destroy: () => t.destroy() };
  }
  const s = await LanguageModel.create({ outputLanguage: 'en' });
  return { call: () => s.prompt(c.input), destroy: () => s.destroy() };
}

export const MiniEval: React.FC = () => {
  const [caseId, setCaseId] = useState<string>(EVAL_CASES[0].id);
  const [runs, setRuns] = useState<number>(8);
  const [results, setResults] = useState<RunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [promptUnavailable, setPromptUnavailable] = useState(false);

  const selected = useMemo(
    () => EVAL_CASES.find((c) => c.id === caseId) ?? EVAL_CASES[0],
    [caseId],
  );

  // Prompt (Gemini Nano) needs Canary / flags on stable — check when selected.
  useEffect(() => {
    let cancelled = false;
    if (selected.api !== 'prompt') {
      setPromptUnavailable(false);
      return;
    }
    (async () => {
      try {
        const a = await LanguageModel.availability({ outputLanguage: 'en' });
        if (!cancelled) setPromptUnavailable(a === 'unavailable');
      } catch {
        if (!cancelled) setPromptUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const run = async () => {
    setRunning(true);
    setResults([]);
    const acc: RunResult[] = [];
    const push = (r: RunResult) => {
      acc.push(r);
      setResults([...acc]);
    };

    let runner: { call: () => Promise<string>; destroy: () => void };
    try {
      runner = await makeRunner(selected);
    } catch (e) {
      // create() failed (e.g. Prompt API not executable) — every run is an infra
      // ERROR, not a FAIL (a FAIL would skew the stability rate).
      const reason = (e as { name?: string })?.name ?? 'create failed';
      for (let i = 0; i < runs; i++) push({ index: i, status: 'error', reason });
      setRunning(false);
      return;
    }

    try {
      for (let i = 0; i < runs; i++) {
        try {
          const output = await runner.call();
          const res = selected.check(output);
          push({ index: i, status: res.pass ? 'pass' : 'fail', reason: res.reason, output });
        } catch (e) {
          push({ index: i, status: 'error', reason: (e as { name?: string })?.name ?? 'run failed' });
        }
      }
    } finally {
      try {
        runner.destroy();
      } catch {
        /* already gone */
      }
      setRunning(false);
    }
  };

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const errored = results.filter((r) => r.status === 'error').length;
  const scored = passed + failed;
  const stability = scored > 0 ? Math.round((passed / scored) * 100) : null;
  const done = results.length >= runs && !running;

  const badge =
    stability == null
      ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      : stability >= 80
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        : stability >= 50
          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';

  return (
    <div className="space-y-5">
      {promptUnavailable && (
        <MissingFlagBanner
          title="The Prompt API isn't available in this browser."
          body="The Summarizer and Translator test cases still run here. To evaluate the Prompt API (Gemini Nano), use Chrome Canary or enable the flags below, then relaunch."
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

      {/* Golden set — pick a case, then see exactly what it sends + its pass rule */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Golden set
        </p>
        <div className="flex flex-wrap gap-2">
          {EVAL_CASES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCaseId(c.id);
                setResults([]);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                c.id === selected.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* The exact input the model receives + the rule its answer must satisfy */}
        <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {selected.api}
            </span>
            <span className="text-gray-400 dark:text-gray-500">input sent to the model</span>
          </div>
          <p className="whitespace-pre-wrap rounded bg-gray-50 p-2 text-sm text-gray-800 dark:bg-gray-900/40 dark:text-gray-200">
            {selected.input}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium text-gray-500 dark:text-gray-400">Passes when:</span>{' '}
            {selected.rule}
          </p>
        </div>
      </div>

      {/* Runs + go */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600 dark:text-gray-300">Runs:</span>
        {RUN_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRuns(n)}
            className={`rounded-md px-2.5 py-1 text-sm font-medium ${
              runs === n
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {n}×
          </button>
        ))}
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {running ? `Running… (${results.length}/${runs})` : `Run eval ${runs}×`}
        </button>
      </div>

      {/* Progress dots */}
      {results.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {results.map((r) => (
            <span
              key={r.index}
              title={`run ${r.index + 1}: ${r.status}${r.reason ? ` — ${r.reason}` : ''}`}
              className={`h-4 w-4 rounded-full ${DOT[r.status]}`}
            />
          ))}
        </div>
      )}

      {/* Stability result */}
      {stability != null && (
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${badge}`}>
            passed {passed}/{scored} · {stability}% stable
          </span>
          {errored > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {errored} errored (infra — not counted, per the “ERROR ≠ FAIL” rule)
            </span>
          )}
          {done && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              A single pass/fail would hide this — the model is non-deterministic.
            </span>
          )}
        </div>
      )}

      {/* Per-run detail */}
      {results.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600 dark:text-gray-300">Per-run detail</summary>
          <ul className="mt-2 space-y-2">
            {results.map((r) => (
              <li key={r.index} className="text-xs text-gray-600 dark:text-gray-300">
                <span className="font-mono">
                  <span
                    className={
                      r.status === 'pass'
                        ? 'text-green-600 dark:text-green-400'
                        : r.status === 'fail'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-400'
                    }
                  >
                    {r.status.toUpperCase()}
                  </span>{' '}
                  run {r.index + 1}
                  {r.reason ? ` — ${r.reason}` : ''}
                </span>
                {r.output != null && r.output.trim() !== '' && (
                  <p className="mt-0.5 whitespace-pre-wrap rounded bg-gray-50 px-2 py-1 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                    {r.output}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        🔒 Runs entirely on-device in your browser. These are <em>rule-based</em> checks — see the
        docs for LLM-as-judge and running this in CI.
      </p>
    </div>
  );
};

export default MiniEval;
