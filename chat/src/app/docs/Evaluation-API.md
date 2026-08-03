# Evaluating Chrome Built-in AI

How to check whether an on-device model (`LanguageModel` / Prompt, `Summarizer`, `Translator`, `Writer`, `Rewriter`, `Proofreader`) actually gives **good** answers — and how to keep checking as Chrome silently updates the model under you.

Why bother: the built-in models are **small** and **non-deterministic**. They can be confidently wrong, and the same prompt can give a different answer each time. So you don't eyeball it once — you build a little test suite and measure it.

The whole approach in four ideas: **golden set → score each answer → run it many times → report a stability rate.**

---

## 1. A golden set

A handful of trusted inputs paired with what a *good* answer looks like. Cover the happy path, edge cases, and a few nasty ones.

```js
const goldenSet = [
  { id: 'short-summary', input: longArticle,           rule: 'summary ≤ 40 words' },
  { id: 'yes-no',        input: 'Answer yes or no: …', rule: "exactly 'yes' or 'no'" },
  // …8–30 of these to start; ~1000 before a big release.
];
```

---

## 2. Score each answer

Two kinds of checks. Start with the first — it's free, fast, and deterministic.

### Rule-based (regular code — no model)

Objective things: valid JSON, required keys, length limits, a language, a number in range.

```js
function scoreShortSummary(output) {
  const words = output.trim().split(/\s+/).filter(Boolean).length;
  return { pass: output.trim().length > 0 && words <= 40, reason: `${words} words` };
}

function scoreYesNo(output) {
  const a = output.trim().toLowerCase().replace(/[.!"']/g, '');
  return { pass: a === 'yes' || a === 'no', reason: `got "${output.trim()}"` };
}
```

This is the **CI-safe core** — 100% reproducible, no second model needed. The Demo tab runs exactly these kinds of checks live.

### LLM-as-judge (for fuzzy criteria)

Subjective things — tone, helpfulness, "is this on-brand?", toxicity — need a *judge model* with a rubric.

```js
// pseudo-code — grade one answer with a rubric, temperature 0, structured out
const verdict = await judge.generate({
  system: 'You grade answers PASS/FAIL against the rubric. Reply {"label","rationale"}.',
  rubric: 'The reply is polite and does not invent facts.',
  answer: output,
  temperature: 0,
});
```

Two honest catches:
- **Don't let Gemini Nano judge itself.** It's too small to grade reliably, you **can't set `temperature` on the web** (so it won't be consistent), and a model grading its own output is biased. Use a bigger judge — a **local model (e.g. Ollama)** if you must stay offline, or a **cloud model** behind an env flag for a separate, non-blocking "expert" tier.
- **Validate the judge** before you trust it: check its labels agree with a human on ~85%+ of a labelled set.

---

## 3. Run it many times — the stability rate

Because output varies, one run tells you almost nothing. Run each case **5–10 times**, score each, and report the ratio.

```js
async function stabilityRate(run, check, n = 10) {
  let passed = 0, errored = 0;
  for (let i = 0; i < n; i++) {
    try {
      const out = await run();
      if (check(out).pass) passed++;
    } catch {
      errored++;                 // infra problem → ERROR, not FAIL
    }
  }
  const scored = n - errored;    // a FAIL you didn't earn would skew the number
  return { passed, scored, rate: scored ? passed / scored : 1 };
}
// → "passed 8/10 → 80% stable"
```

Rule of thumb: report **`ERROR` (the harness broke) separately from `FAIL` (the model was wrong)**. Counting infra errors as failures makes a good model look bad.

---

## 4. Running against `window.ai` (and CI)

Here's the catch that surprises people: **`window.ai` only exists in a browser tab.** It's not in Node, so a normal test runner can't `import` it. You drive a real browser instead.

### Bridge with Playwright

Launch **real Chrome/Canary** (not bundled Chromium — it lacks the model) and call the API inside the page.

```js
// pseudo-code — run the on-device model from a Node test via Playwright
const ctx = await chromium.launchPersistentContext(NANO_PROFILE, {
  channel: 'chrome',            // 'chrome-canary' for Writer/Rewriter/Proofreader
  headless: false,              // headful is safest for Nano; xvfb in CI
});
const page = await ctx.newPage();
const output = await page.evaluate(async (text) => {
  const s = await LanguageModel.create({ outputLanguage: 'en' });
  const r = await s.prompt(text); s.destroy(); return r;
}, input);
// …then score `output` and compute the stability rate in Node (Vitest, etc.)
```

Enable the model once in that profile's `chrome://flags` (`#optimization-guide-on-device-model`, `#prompt-api-for-gemini-nano`, …) and let it download — a pre-warmed profile is far more reliable than command-line flags.

### The honest CI verdict

**Real Gemini Nano won't run on standard GitHub-hosted runners** — it needs ~22 GB free disk, a GPU or 16 GB RAM, and a multi-GB download every job. So split it:

| When | What runs | Model |
|---|---|---|
| **Every PR** (hosted runner) | rule-based evals + a **mocked `window.ai`** | none |
| **Nightly** (self-hosted / GPU, pre-warmed profile) | real stability-rate evals | real Nano |
| **Local dev** | the full suite | real Nano |
| **Judge tier** (optional) | fuzzy rubrics (local Ollama / cloud) | non-blocking |

And because Chrome auto-updates Nano, **pin your eval suite and re-run it on every Chrome release** — a regression on your golden set is your early warning.

---

## Frameworks

You don't need much. Options that fit a JS/TS app:
- **Vitest + Playwright** — write the bridge yourself; most control, nothing new to learn.
- **evalite** — a Vitest-based eval runner with a dashboard and CI thresholds.
- **promptfoo** — a custom JS provider can shell out to your Playwright bridge; gives you assertions + a matrix UI.

Python tools (DeepEval, Ragas) can't reach `window.ai` without a bridge — skip them for on-device browser work.
