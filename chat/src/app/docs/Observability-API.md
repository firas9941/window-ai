# Observability for Chrome Built-in AI

How to add **logging and tracing** to an app that uses Chrome's built-in, on-device AI (`LanguageModel` / Prompt, `Summarizer`, `Translator`, `Writer`, `Rewriter`, `Proofreader`).

The important thing first: **on-device inference has no server round-trip to instrument.** There is no request going over the wire, no logprobs, no confidence score, no per-response token bill, and no way to query the model version. So observability is 100% your own client-side job — you *manufacture* it from the handful of signals Chrome exposes. The good news: that's only ~30 lines of code, and nothing ever leaves the device unless you choose to send it.

---

## What you can actually capture

| Signal | How | Which APIs |
|---|---|---|
| Wall-clock latency | `performance.now()` around the `await` | all |
| Time to first token (TTFT) | first chunk of a `*Streaming()` call | Prompt, Summarizer, Writer, Rewriter |
| Output size (char proxy, **not** tokens) | accumulate chunk `.length` | streaming APIs |
| Context / token accounting | `session.contextUsage` / `session.contextWindow` | **Prompt API** |
| Availability | `availability()` → `unavailable`/`downloadable`/`downloading`/`available` | all |
| Download progress | `monitor()` → `downloadprogress` (`e.loaded` 0→1) | all |
| Errors | `DOMException.name` (`QuotaExceededError`, `NotSupportedError`, `AbortError`…) | all |
| Real confidence | `{ detectedLanguage, confidence }` | **LanguageDetector only** |

> **Naming drift:** the Prompt API renamed `inputUsage`→`contextUsage`, `inputQuota`→`contextWindow`, `measureInputUsage()`→`measureContextUsage()`. MDN and Extensions still show the old names. Read defensively: `session.contextUsage ?? session.inputUsage`.

---

## Level 0 — `console.log`

Start dumb. Time the call and log it.

```js
async function summarize(text) {
  const summarizer = await Summarizer.create({ type: 'key-points', outputLanguage: 'en' });
  const t0 = performance.now();
  const result = await summarizer.summarize(text);
  console.log('[ai] summarize', {
    ms: Math.round(performance.now() - t0),
    chars: result.length,
  });
  summarizer.destroy();
  return result;
}
```

Collect a few of these in an array and you get a table for free:

```js
console.table(window.__aiSpans);
```

---

## Level 1 — a structured span

Give every call the same shape so you can filter, sort, and later ship it anywhere.

```js
// One record per AI call. Only fields Chrome actually gives you.
function newSpan(api, op) {
  return { id: crypto.randomUUID(), ts: Date.now(), api, op,
           latencyMs: 0, finish: 'ok' };
}

const spans = [];
function record(span) { spans.push(span); /* + render / ship it */ }
```

---

## Level 2 — capture the real signals

### Latency + TTFT for a streaming call

Because the stream is where the time goes, measure the **first chunk** (TTFT) and the total.

```js
async function tracedStream(api, op, session, makeStream) {
  const span = newSpan(api, op);
  const t0 = performance.now();
  let firstChunk = true, chars = 0;
  try {
    for await (const chunk of makeStream()) {
      if (firstChunk) { span.ttftMs = performance.now() - t0; firstChunk = false; }
      chars += chunk.length;
      // ...render the chunk to the UI here...
    }
  } catch (e) {
    span.finish = e.name === 'AbortError' ? 'abort' : 'error';
    span.errorName = e.name;                 // QuotaExceededError, NotSupportedError…
    throw e;
  } finally {
    span.latencyMs = performance.now() - t0;
    span.outChars = chars;
    // Prompt API only — read drift-safe; may throw on a destroyed session.
    try {
      span.contextUsage  = session.contextUsage  ?? session.inputUsage;
      span.contextWindow = session.contextWindow ?? session.inputQuota;
    } catch { /* session was destroyed — skip */ }
    record(span);
  }
}
```

### Availability + download progress

```js
const availability = await LanguageModel.availability({ outputLanguage: 'en' });

const session = await LanguageModel.create({
  outputLanguage: 'en',
  monitor(m) {
    m.addEventListener('downloadprogress', (e) => {
      console.log('[ai] download', Math.round(e.loaded * 100) + '%');
    });
  },
});
```

### Errors are first-class

The most useful thing you can log on-device is *why it failed*: `QuotaExceededError` (input too big — it also carries `requested` and `contextWindow`), `NotSupportedError` (feature can't execute on this Chrome), `AbortError`, and the `contextoverflow` event on a Prompt session.

---

## Level 3 — ship it somewhere

You *can* keep everything local (an in-page panel + IndexedDB) with **no backend**. If you want to aggregate across users, here's the honest state of the ecosystem — shown as **pseudo-code**, because none of these have a drop-in adapter for `window.ai`, and each has a catch.

### OpenTelemetry — `gen_ai.*` semantic conventions

The vocabulary ports even though the tooling doesn't. Emit an **`INTERNAL`** span (the model runs in-process — there's no `server.address`).

```js
// pseudo-code — map your span onto the GenAI semantic conventions
span({
  name: `gen_ai.${op}`,
  kind: 'INTERNAL',
  attributes: {
    'gen_ai.operation.name': op,
    'gen_ai.provider.name':  'chrome.builtin',
    'gen_ai.request.model':  'gemini-nano',       // Chrome exposes no version
    'gen_ai.request.stream': true,
    'gen_ai.response.time_to_first_chunk': ttftMs / 1000,
    'gen_ai.usage.input_tokens': contextUsage,    // approximate (cumulative)
    'gen_ai.response.finish_reasons': [finish],
  },
});
```

- ✅ Works fully local with a `ConsoleSpanExporter` or a custom exporter that writes to IndexedDB / an in-page panel.
- ⚠️ Exporting to an **OTLP collector from the browser** is a CORS/CSP minefield and needs a running collector — i.e. a backend. The conventions are still marked *experimental*.

### Sentry

```js
// pseudo-code — browser AI monitoring needs MANUAL spans (no auto-instrumentation for window.ai)
Sentry.startSpan(
  { op: `gen_ai.${op}`, name: `${op} gemini-nano`, attributes: { 'gen_ai.request.model': 'gemini-nano' } },
  (s) => {
    s.setAttribute('gen_ai.response.time_to_first_chunk', ttftMs / 1000);
    s.setAttribute('gen_ai.usage.input_tokens', contextUsage);
  },
);
```

- ✅ Runs in the browser, but ships every span to a Sentry **DSN** (leaves the device).

### Langfuse

```js
// pseudo-code — the BROWSER SDK is score/feedback only (public key)
langfuse.score({ traceId, name: 'user_feedback', value: 1 });
```

- ⚠️ Full trace/generation ingestion needs a **Node backend + secret key**. From the browser you can only attach **scores/feedback** to a trace some server created — great for a 👍/👎 button, not for tracing.

### The honest matrix

| Target | No-backend browser? | Catch |
|---|---|---|
| `console.log` / `console.table` | ✅ | ephemeral |
| In-page panel + IndexedDB | ✅ | you build the UI |
| OpenTelemetry `gen_ai.*` (local exporter) | ✅ | OTLP export → needs a collector (CORS) |
| **Sentry** | ✅ (to a DSN) | data leaves the device |
| **Langfuse** | ⚠️ scores only | tracing needs a Node backend |

---

## Privacy

Everything at Level 0–2 is local. The moment you add Sentry / Langfuse / an OTLP collector, data leaves the device — so make external sinks **explicit opt-in**, and **don't log raw prompts or responses** by default (log sizes and timings, not content). That keeps the on-device privacy promise intact.
