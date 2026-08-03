# Prompt API

## Prerequisites

### Enable Gemini Nano and the Prompt API

Follow these steps to enable Gemini Nano and the Prompt API flags for local experimentation:
1. Open a new tab in Chrome, go to chrome://flags/#optimization-guide-on-device-model
2. Select Enabled BypassPerfRequirement 
   - This bypass performance checks which might get in the way of having Gemini Nano downloaded on your device.
3. Go to chrome://flags/#prompt-api-for-gemini-nano
4. Select Enabled
5. Relaunch Chrome.

### Confirm availability of Gemini Nano
1. Open DevTools and send `await LanguageModel.availability();` in the console.
2. If this returns `"available"`, then you are all set. (Other values: `"downloadable"`, `"downloading"`, `"unavailable"`.)


### Zero-shot prompting

In this example, a single string is used to prompt the API, which is assumed to come from the user. The returned response is from the language model.

```js
const session = await LanguageModel.create();

// Prompt the model and wait for the whole result to come back.
const result = await session.prompt("Write me a poem.");
console.log(result);

// Prompt the model and stream the result:
const stream = session.promptStreaming("Write me an extra-long poem.");
for await (const chunk of stream) {
  console.log(chunk);
}
```

### System prompts

The language model can be configured with a special "system prompt" which gives it the context for future interactions:

```js
const session = await LanguageModel.create({
  initialPrompts: [
    { role: "system", content: "Pretend to be an eloquent hamster." }
  ]
});

console.log(await session.prompt("What is your favorite food?"));
```

The system prompt is special, in that the language model will not respond to it, and it will be preserved even if the context window otherwise overflows due to too many calls to `prompt()`.

If the system prompt is too large (see [below](#tokenization-context-window-length-limits-and-overflow)), then the promise will be rejected with a `"QuotaExceededError"` `DOMException`.

### N-shot prompting

If developers want to provide examples of the user/assistant interaction, they can use the `initialPrompts` array. This aligns with the common "chat completions API" format of `{ role, content }` pairs, including a `"system"` role as shown above.

```js
const session = await LanguageModel.create({
  initialPrompts: [
    { role: "system", content: "Predict up to 5 emojis as a response to a comment. Output emojis, comma-separated." },
    { role: "user", content: "This is amazing!" },
    { role: "assistant", content: "❤️, ➕" },
    { role: "user", content: "LGTM" },
    { role: "assistant", content: "👍, 🚢" }
  ]
});

// Clone an existing session for efficiency, instead of recreating one each time.
async function predictEmoji(comment) {
  const freshSession = await session.clone();
  return await freshSession.prompt(comment);
}

const result1 = await predictEmoji("Back to the drawing board");

const result2 = await predictEmoji("This code is so good you should get promoted");
```

(Note that merely creating a session does not cause any new responses from the language model. We need to call `prompt()` or `promptStreaming()` to get a response.)

Some details on error cases:

* Using both `systemPrompt` and a `{ role: "system" }` prompt in `initialPrompts`, or using multiple `{ role: "system" }` prompts, or placing the `{ role: "system" }` prompt anywhere besides at the 0th position in `initialPrompts`, will reject with a `TypeError`.
* If the combined token length of all the initial prompts (including the separate `systemPrompt`, if provided) is too large, then the promise will be rejected with a `"QuotaExceededError"` `DOMException`.

### Customizing the role per prompt

Our examples so far have provided `prompt()` and `promptStreaming()` with a single string. Such cases assume messages will come from the user role. These methods can also take in objects in the `{ role, content }` format, or arrays of such objects, in case you want to provide multiple user or assistant messages before getting another assistant message:

```js
const multiUserSession = await LanguageModel.create({
  initialPrompts: [
    { role: "system", content: "You are a mediator in a discussion between two departments." }
  ]
});

const result = await multiUserSession.prompt([
  { role: "user", content: "Marketing: We need more budget for advertising campaigns." },
  { role: "user", content: "Finance: We need to cut costs and advertising is on the list." },
  { role: "assistant", content: "Let's explore a compromise that satisfies both departments." }
]);

// `result` will contain a compromise proposal from the assistant.
```

Because of their special behavior of being preserved on context window overflow, system prompts cannot be provided this way.

### Configuration of per-session options

In addition to the `initialPrompts` option shown above, the currently-configurable options are [temperature](https://huggingface.co/blog/how-to-generate#sampling) and [top-K](https://huggingface.co/blog/how-to-generate#top-k-sampling). Default and maximum values for these parameters come from `LanguageModel.params()`, explained [below](#checking-availability-and-parameters).

```js
const customSession = await LanguageModel.create({
  outputLanguage: 'en',
  temperature: 0.8,
  topK: 10
});

const params = await LanguageModel.params();
const slightlyHighTemperatureSession = await LanguageModel.create({
  outputLanguage: 'en',
  temperature: Math.max(
    params.defaultTemperature * 1.2,
    params.maxTemperature
  ),
  topK: 10
});

// params also contains defaultTopK and maxTopK.
```

### Session persistence and cloning

Each language model session consists of a persistent series of interactions with the model:

```js
const session = await LanguageModel.create({
  initialPrompts: [
    { role: "system", content: "You are a friendly, helpful assistant specialized in clothing choices." }
  ]
});

const result = await session.prompt(`
  What should I wear today? It's sunny and I'm unsure between a t-shirt and a polo.
`);

console.log(result);

const result2 = await session.prompt(`
  That sounds great, but oh no, it's actually going to rain! New advice??
`);
```

Multiple unrelated continuations of the same prompt can be set up by creating a session and then cloning it:

```js
const session = await LanguageModel.create({
  initialPrompts: [
    { role: "system", content: "You are a friendly, helpful assistant specialized in clothing choices." }
  ]
});

const session2 = await session.clone();
```

The clone operation can be aborted using an `AbortSignal`:

```js
const controller = new AbortController();
const session2 = await session.clone({ signal: controller.signal });
```

### Session destruction

A language model session can be destroyed, either by using an `AbortSignal` passed to the `create()` method call:

```js
const controller = new AbortController();
stopButton.onclick = () => controller.abort();

const session = await LanguageModel.create({ signal: controller.signal });
```

or by calling `destroy()` on the session:

```js
stopButton.onclick = () => session.destroy();
```

Destroying a session will have the following effects:

* If done before the promise returned by `create()` is settled:

    * Stop signaling any ongoing download progress for the language model. (The browser may also abort the download, or may continue it. Either way, no further `downloadprogress` events will fire.)

    * Reject the `create()` promise.

* Otherwise:

    * Reject any ongoing calls to `prompt()`.

    * Error any `ReadableStream`s returned by `promptStreaming()`.

* Most importantly, destroying the session allows the user agent to unload the language model from memory, if no other APIs or sessions are using it.

In all cases the exception used for rejecting promises or erroring `ReadableStream`s will be an `"AbortError"` `DOMException`, or the given abort reason.

The ability to manually destroy a session allows applications to free up memory without waiting for garbage collection, which can be useful since language models can be quite large.

### Aborting a specific prompt

Specific calls to `prompt()` or `promptStreaming()` can be aborted by passing an `AbortSignal` to them:

```js
const controller = new AbortController();
stopButton.onclick = () => controller.abort();

const result = await session.prompt("Write me a poem", { signal: controller.signal });
```

Note that because sessions are stateful, and prompts can be queued, aborting a specific prompt is slightly complicated:

* If the prompt is still queued behind other prompts in the session, then it will be removed from the queue.
* If the prompt is being currently processed by the model, then it will be aborted, and the prompt/response pair will be removed from the conversation history.
* If the prompt has already been fully processed by the model, then attempting to abort the prompt will do nothing.

### Tokenization, context window length limits, and overflow

A given language model session will have a maximum number of tokens it can process. Developers can check their current usage and progress toward that limit by using the following properties on the session object:

```js
// Current names (older Chrome / MDN used inputUsage / inputQuota):
console.log(`${session.contextUsage}/${session.contextWindow} (${session.contextWindow - session.contextUsage} left)`);
```

To know how many tokens a string will consume, without actually processing it, developers can use the `measureInputUsage()` method (older builds called this `countPromptTokens()`):

```js
const numTokens = await session.measureInputUsage(promptString);
```

Some notes on this API:

* We do not expose the actual tokenization to developers since that would make it too easy to depend on model-specific details.
* Implementations must include in their count any control tokens that will be necessary to process the prompt, e.g. ones indicating the start or end of the input.
* The counting process can be aborted by passing an `AbortSignal`, i.e. `session.measureInputUsage(promptString, { signal })`.

It's possible to send a prompt that causes the context window to overflow. That is, consider a case where `session.measureInputUsage(promptString) > (session.contextWindow - session.contextUsage)` before calling `session.prompt(promptString)`, and then the web developer calls `session.prompt(promptString)` anyway. In such cases, the initial portions of the conversation with the language model will be removed, one prompt/response pair at a time, until enough tokens are available to process the new prompt. The exception is the [system prompt](#system-prompts), which is never removed. If it's not possible to remove enough tokens from the conversation history to process the new prompt, then the `prompt()` or `promptStreaming()` call will fail with an `"QuotaExceededError"` `DOMException` and nothing will be removed.

Such overflows can be detected by listening for the `"contextoverflow"` event on the session:

```js
session.addEventListener("contextoverflow", () => {
  console.log("Context overflow!");
});
```

### Checking availability and parameters

In all our above examples, we call `LanguageModel.create()` and assume it will always succeed.

However, sometimes a language model needs to be downloaded before the API can be used. Call `LanguageModel.availability()` to check the current state before calling `create()`:

```js
const availability = await LanguageModel.availability();
console.log(availability);
```

`availability()` returns one of four strings:

* `"unavailable"`, indicating the device or browser does not support prompting a language model at all.
* `"downloadable"`, indicating it is supported, but the model needs to be downloaded before it can be used.
* `"downloading"`, indicating the model is currently downloading.
* `"available"`, indicating it is ready to be used without any downloading steps.

In the `"downloadable"` case, developers might want to have users confirm before you call `create()` to start the download, since doing so uses up significant bandwidth. Note that regardless of the return value, `create()` might also fail if the download or session creation fails.

Separately, `LanguageModel.params()` returns the model's sampling parameters:

```js
const params = await LanguageModel.params();
// { defaultTopK, maxTopK, defaultTemperature, maxTemperature }
```

### Download progress

In cases where the model needs to be downloaded as part of creation, you can monitor the download progress (e.g. in order to show your users a progress bar) using code such as the following:

```js
const session = await LanguageModel.create({
  monitor(m) {
    m.addEventListener("downloadprogress", e => {
      console.log(`Downloaded ${Math.round(e.loaded * 100)}%`); // e.loaded is a 0→1 fraction
    });
  }
});
```

If the download fails, then `downloadprogress` events will stop being emitted, and the promise returned by `create()` will be rejected with a "`NetworkError`" `DOMException`.

## Detailed design

### Current API surface

The Prompt API is exposed as the bare global `LanguageModel` — there is no `self.ai` namespace, and the earlier-draft members `capabilities()`, `countPromptTokens()`, `tokensSoFar`/`maxTokens`/`tokensLeft`, and the `systemPrompt` create option no longer exist.

```ts
// Static
LanguageModel.availability(options?): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
LanguageModel.params(): Promise<{ defaultTopK: number; maxTopK: number; defaultTemperature: number; maxTemperature: number }>;
LanguageModel.create(options?): Promise<LanguageModel>;

interface LanguageModelCreateOptions {
  outputLanguage?: string;                 // e.g. 'en' — recommended in Chrome 147+
  temperature?: number;
  topK?: number;
  initialPrompts?: { role: "system" | "user" | "assistant"; content: string }[];
  responseFormat?: object;                 // JSON Schema for structured output
  monitor?: (m: { addEventListener(type: "downloadprogress", cb: (e: ProgressEvent) => void): void }) => void;
  signal?: AbortSignal;
}

// Session (the instance returned by create())
session.prompt(input, options?): Promise<string>;
session.promptStreaming(input, options?): ReadableStream<string>;
session.measureInputUsage(input, options?): Promise<number>;
session.clone(options?): Promise<LanguageModel>;
session.destroy(): void;
readonly session.contextUsage: number;     // older name: inputUsage
readonly session.contextWindow: number;    // older name: inputQuota
// event: "contextoverflow"
```

### Instruction-tuned versus base models

We intend for this API to expose instruction-tuned models. Although we cannot mandate any particular level of quality or instruction-following capability, we think setting this base expectation can help ensure that what browsers ship is aligned with what web developers expect.

To illustrate the difference and how it impacts web developer expectations:

* In a base model, a prompt like "Write a poem about trees." might get completed with "... Write about the animal you would like to be. Write about a conflict between a brother and a sister." (etc.) It is directly completing plausible next tokens in the text sequence.
* Whereas, in an instruction-tuned model, the model will generally _follow_ instructions like "Write a poem about trees.", and respond with a poem about trees.

To ensure the API can be used by web developers across multiple implementations, all browsers should be sure their models behave like instruction-tuned models.

## Alternatives considered and under consideration

### How many stages to reach a response?

To actually get a response back from the model given a prompt, the following possible stages are involved:

1. Download the model, if necessary.
2. Establish a session, including configuring [per-session options](#configuration-of-per-session-options).
3. Add an initial prompt to establish context. (This will not generate a response.)
4. Execute a prompt and receive a response.

We've chosen to manifest these 3-4 stages into the API as two methods, `LanguageModel.create()` and `session.prompt()`/`session.promptStreaming()`, with some additional facilities for dealing with the fact that `LanguageModel.create()` can include a download step. Some APIs simplify this into a single method, and some split it up into three (usually not four).

### Stateless or session-based

Our design here uses [sessions](#session-persistence-and-cloning). An alternate design, seen in some APIs, is to require the developer to feed in the entire conversation history to the model each time, keeping track of the results.
This can be slightly more flexible; for example, it allows manually correcting the model's responses before feeding them back into the context window.
However, our understanding is that the session-based model can be more efficiently implemented, at least for browsers with on-device models. (Implementing it for a cloud-based model would likely be more work.) And, developers can always achieve a stateless model by using a new session for each interaction.

