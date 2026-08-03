# Chrome Proofreader API Usage Guide

This document is a complete reference for Chrome's built-in **Proofreader API**, an on-device grammar, spelling, capitalization, and punctuation correction API powered by a LoRA adapter on top of Gemini Nano. All correction work runs locally — no text leaves the device.

## Overview

The Proofreader API exposes a single global, `Proofreader`, with two static methods:

- `Proofreader.availability(options)` — returns a string describing whether the model is ready.
- `Proofreader.create(options)` — returns a `Proofreader` session you can call `proofread()` on.

A session is **language-scoped**: each one targets one or more `expectedInputLanguages` and may take a few seconds to download a LoRA adapter on first use. Sessions are reusable — keep one per language and call `proofread()` repeatedly rather than recreating per call.

## Prerequisites

### Browser Support

- Chrome 150 desktop (Windows, macOS, Linux) — behind a flag
- Requires Gemini Nano on-device (≈ 22 GB free disk, 4 GB+ VRAM)
- Still origin trial / behind a flag as of Chrome 150 — not yet stable. Enable `chrome://flags/#proofreader-api-for-gemini-nano` for local dev, or register an origin-trial token for a deployed origin.

### Setup Instructions

1. **Enable the on-device model**:
   ```
   chrome://flags/#optimization-guide-on-device-model
   ```
   Set to **Enabled BypassPerfRequirement** and restart Chrome.

2. **Enable the Proofreader API**:
   ```
   chrome://flags/#proofreader-api-for-gemini-nano
   ```
   Set to **Enabled** and restart Chrome.

3. **Inspect model state** (optional, useful for debugging stalled downloads):
   ```
   chrome://on-device-internals
   ```

### Checking API Availability

```javascript
// Returns one of: "available", "downloadable", "downloading", "unavailable"
const status = await Proofreader.availability({ expectedInputLanguages: ["en"] });

if (status === "unavailable") {
  console.warn("Proofreader not available — check chrome://flags");
}
```

`availability()` is cheap and synchronous-feeling — call it on page load to decide whether to show the workbench or a "please enable the flag" message.

## Basic Usage

### Creating a Session

```javascript
const proofreader = await Proofreader.create({
  expectedInputLanguages: ["en"],
  includeCorrectionTypes: true,
  includeCorrectionExplanations: true,
  correctionExplanationLanguage: "en"
});
```

- `expectedInputLanguages` — array of BCP 47 tags. The model will download the matching LoRA adapter on first use. Supported values today: `"en"`, `"es"`, `"ja"`, `"de"`, `"fr"`.
- `includeCorrectionTypes` — when `true`, each correction reports `types[]` (e.g. `"spelling"`, `"grammar"`).
- `includeCorrectionExplanations` — when `true`, each correction reports a human-readable `explanation`.
- `correctionExplanationLanguage` — BCP 47 tag for the explanation text (independent of the input language).

### Proofreading Text

```javascript
const result = await proofreader.proofread(
  "i think there going to a meetting tommorow at the office."
);

console.log(result.correctedInput);
// "I think they're going to a meeting tomorrow at the office."

for (const c of result.corrections) {
  console.log(c.startIndex, c.endIndex, c.correction, c.types, c.explanation);
}
```

### The `ProofreadResult` Shape

```javascript
{
  correctedInput: "I think they're going to a meeting tomorrow at the office.",
  corrections: [
    {
      startIndex: 0,
      endIndex: 1,
      correction: "I",
      types: ["capitalization"],
      explanation: "The pronoun 'I' is always capitalized."
    },
    {
      startIndex: 8,
      endIndex: 13,
      correction: "they're",
      types: ["spelling", "grammar"],
      explanation: "'there' is a location; 'they're' is the contraction of 'they are'."
    }
    // ...
  ]
}
```

Each correction's `startIndex` / `endIndex` are character offsets **into the original input string**, not into the corrected output. That makes it straightforward to render side-by-side or inline diffs without recomputing alignment.

### Correction Types

`ProofreaderCorrection.types` is an array of any of:

| Type             | Meaning                                                         |
|------------------|-----------------------------------------------------------------|
| `spelling`       | Misspelled word                                                 |
| `punctuation`    | Wrong, missing, or extra punctuation                            |
| `capitalization` | Capitalization rule (proper nouns, sentence start, "I")         |
| `preposition`    | Wrong preposition for the context                               |
| `missing-words`  | Word missing from the original                                  |
| `grammar`        | General grammar (subject-verb agreement, tense, etc.)           |

A single correction may carry multiple types — `["spelling", "grammar"]` is common when a misspelling also fixes verb agreement.

## Download Progress

Loading a LoRA adapter happens on the first `create()` for a language. Surface progress with the `monitor` callback:

```javascript
const proofreader = await Proofreader.create({
  expectedInputLanguages: ["es"],
  includeCorrectionTypes: true,
  includeCorrectionExplanations: true,
  correctionExplanationLanguage: "en",
  monitor(m) {
    m.addEventListener("downloadprogress", (e) => {
      console.log(`Downloaded ${Math.round(e.loaded * 100)}%`);
    });
  }
});
```

The `downloadprogress` event is a `ProgressEvent` where `e.loaded` is a fraction between 0 and 1 and `e.total` is always 1. At least two events (0% and 100%) are guaranteed.

If the download stalls at 0% for more than a minute, point users at `chrome://on-device-internals` to verify the base model is installed.

## Rendering Corrections

Because the `corrections` array carries character ranges into the **original** text, you can build any of the typical UX patterns without re-running the model.

### Plain Mode — Corrected Text + Bulleted List

```javascript
function renderPlain(result) {
  let html = `<p>${escapeHtml(result.correctedInput)}</p><ul>`;
  for (const c of result.corrections) {
    const original = escapeHtml(c.original); // see "Computing the original span" below
    html += `<li>changed "<s>${original}</s>" → <b>${escapeHtml(c.correction)}</b>`;
    if (c.explanation) html += ` — ${escapeHtml(c.explanation)}`;
    html += `</li>`;
  }
  return html + `</ul>`;
}
```

### Computing the Original Span

The corrections don't carry the original text by themselves — slice it out of the input using the indices:

```javascript
function withOriginals(input, corrections) {
  return corrections.map((c) => ({
    ...c,
    original: input.slice(c.startIndex, c.endIndex)
  }));
}
```

### Side-by-Side Diff

Walk the original text, emitting unchanged spans between corrections and highlighted spans inside them. Repeat the walk against `result.correctedInput` for the right-hand column:

```javascript
function buildSegments(input, corrections) {
  const segs = [];
  let cursor = 0;
  for (const c of corrections) {
    if (c.startIndex > cursor) {
      segs.push({ kind: "unchanged", text: input.slice(cursor, c.startIndex) });
    }
    segs.push({
      kind: "changed",
      original: input.slice(c.startIndex, c.endIndex),
      replacement: c.correction
    });
    cursor = c.endIndex;
  }
  if (cursor < input.length) {
    segs.push({ kind: "unchanged", text: input.slice(cursor) });
  }
  return segs;
}
```

Render the left column from `original`, the right column from `replacement`. Wrap `changed` segments in `<mark>` for the highlight.

### Inline Strikethrough

Same `buildSegments()` call, but render `changed` segments as `<del>` for the original followed by `<ins>` for the correction, in one column.

## Error Handling

```javascript
try {
  const result = await proofreader.proofread(text);
  render(result);
} catch (e) {
  if (e instanceof DOMException) {
    if (e.name === "AbortError") return; // user cancelled
    if (e.name === "QuotaExceededError") {
      console.error("Input too long for the proofreader model");
    }
    if (e.name === "NotSupportedError") {
      console.error("Language combination not supported with these options");
    }
  }
  console.error(e);
}
```

The Proofreader rejects when:
- `text` exceeds the model's input limit (`QuotaExceededError`)
- The requested language is not yet supported (`NotSupportedError`)
- The session is destroyed mid-call (`AbortError`)
- The on-device model is unavailable at proofread time

## Cancellation

```javascript
const controller = new AbortController();
stopButton.addEventListener("click", () => controller.abort());

const result = await proofreader.proofread(text, { signal: controller.signal });
```

Aborting rejects the in-flight `proofread()` with an `AbortError` `DOMException`. The session itself stays usable — only the one call is cancelled.

To free the model entirely:

```javascript
proofreader.destroy();
```

Any in-flight calls reject with `AbortError`, and the user agent is free to unload the LoRA adapter from memory.

## Language Support

The Proofreader currently ships LoRA adapters for five languages. Each one requires its own `create()` call — sessions are not cross-lingual.

| Code  | Language   |
|-------|------------|
| `en`  | English    |
| `es`  | Spanish    |
| `ja`  | Japanese   |
| `de`  | German     |
| `fr`  | French     |

`correctionExplanationLanguage` is independent from `expectedInputLanguages` — you can proofread Spanish text and receive explanations in English by passing `expectedInputLanguages: ["es"], correctionExplanationLanguage: "en"`.

## Best Practices

1. **Pool sessions by language.** Creating a session triggers an adapter download on first use. Hold onto the session and reuse it for every proofread call in that language.
2. **Call `availability()` first.** Cheap, synchronous-feeling, lets you show a flag-setup banner instead of waiting for `create()` to throw.
3. **Surface the download.** Add a `monitor` callback so users see why the page is busy on the first call.
4. **Slice originals from the input.** The corrections carry indices, not original text — keep the input around until you've rendered.
5. **Cancel on unmount.** Call `destroy()` (or abort each pending `proofread()`) when the user navigates away to release the model from VRAM.
6. **Keep input short on first call.** Adapter downloads are large; surface a small example and let the user expand it once corrections render.

## Using with TypeScript

```typescript
type ProofreaderCorrectionType =
  | "spelling"
  | "punctuation"
  | "capitalization"
  | "preposition"
  | "missing-words"
  | "grammar";

interface ProofreaderCorrection {
  startIndex: number;
  endIndex: number;
  correction: string;
  types?: ProofreaderCorrectionType[];
  explanation?: string;
}

interface ProofreadResult {
  correctedInput: string;
  corrections: ProofreaderCorrection[];
}

const session = await Proofreader.create({
  expectedInputLanguages: ["en"],
  includeCorrectionTypes: true,
  includeCorrectionExplanations: true,
  correctionExplanationLanguage: "en"
});

const out: ProofreadResult = await session.proofread("i think its broke.");
```

## Conclusion

The Proofreader API turns a sentence into a structured set of edits with character-precise indices, which is what makes side-by-side and inline diffs trivial — you never need a second model call to switch views. Pool sessions per language, surface download progress, and slice originals out of the input rather than recomputing them, and the API handles the rest on-device.
