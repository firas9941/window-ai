/**
 * A tiny "golden set" for the in-browser mini-eval (GitHub Evaluation section).
 *
 * Each case is a trusted input plus a deterministic, rule-based check on the
 * model's output — the CI-safe kind of eval. We deliberately keep the on-device
 * model on the stable trio (Summarizer / Translator) so the demo runs for
 * everyone; one Prompt case shows a check the small model often *fails*, which
 * is exactly why you measure a stability rate instead of a single pass/fail.
 */

export type EvalApi = 'summarizer' | 'translator' | 'prompt';

export interface CheckResult {
  pass: boolean;
  /** Short human reason shown next to the run, e.g. "27 words". */
  reason: string;
}

export interface EvalCase {
  id: string;
  name: string;
  api: EvalApi;
  input: string;
  /** Plain-language description of the rule the output must satisfy. */
  rule: string;
  /** Summarizer type, when api === 'summarizer'. */
  summaryType?: 'tl;dr' | 'key-points' | 'teaser' | 'headline';
  /** Deterministic scorer — regular code, no model involved. */
  check: (output: string) => CheckResult;
}

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const lineCount = (s: string): number =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean).length;

const SAMPLE =
  'Chrome ships several built-in AI APIs that run entirely on-device using Gemini Nano. ' +
  'Because inference happens locally, there is no server round-trip, no per-request cost, ' +
  'and no data leaves the machine. Developers can prompt, summarize, translate, write, and ' +
  'proofread without any backend or API key.';

const TRANSLATE_INPUT = 'On-device AI keeps your data on your machine — no server, no cost.';

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'summary-short',
    name: 'Summary is short',
    api: 'summarizer',
    summaryType: 'tl;dr',
    input: SAMPLE,
    rule: 'non-empty and ≤ 40 words',
    check: (o) => {
      const w = wordCount(o);
      return { pass: o.trim().length > 0 && w <= 40, reason: `${w} words` };
    },
  },
  {
    id: 'summary-keypoints',
    name: 'Summary has multiple points',
    api: 'summarizer',
    summaryType: 'key-points',
    input: SAMPLE,
    rule: 'at least 2 bullet points / lines',
    check: (o) => {
      const n = lineCount(o);
      return { pass: n >= 2, reason: `${n} lines` };
    },
  },
  {
    id: 'translate-produced',
    name: 'Translation is produced',
    api: 'translator',
    input: TRANSLATE_INPUT,
    rule: 'non-empty and different from the English input',
    check: (o) => ({
      pass: o.trim().length > 0 && o.trim() !== TRANSLATE_INPUT,
      reason: `${o.trim().length} chars`,
    }),
  },
  {
    id: 'prompt-yesno',
    name: 'Answers yes / no only',
    api: 'prompt',
    input: "Answer with only the single word 'yes' or 'no'. Is the sky blue on a clear day?",
    rule: 'output is exactly "yes" or "no"',
    check: (o) => {
      const a = o.trim().toLowerCase().replace(/[.!"']/g, '');
      return { pass: a === 'yes' || a === 'no', reason: `got “${o.trim().slice(0, 40)}”` };
    },
  },
];
