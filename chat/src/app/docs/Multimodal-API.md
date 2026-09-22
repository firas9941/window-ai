# Chrome Multimodal LanguageModel API Usage Guide

This document is a complete reference for the **multimodal mode** of Chrome's built-in `LanguageModel` API. With one extra option at session creation, the same Gemini Nano session you use for text accepts images alongside text — drag-drop, clipboard paste, single-frame webcam capture, and continuous webcam live feeds. All inference is on-device; no images ever leave the browser.

## Overview

Multimodal mode is unlocked by passing `expectedInputs: [{ type: 'image' }, { type: 'text' }]` when creating a `LanguageModel` session. After that, the prompt API accepts an **array of content parts** instead of a single string, and you can mix `{ type: 'text', value: '...' }` and `{ type: 'image', value: <imageLike> }` parts in any order.

## Prerequisites

### Browser Support

- **Chrome 148+** (stable) on desktop with a sufficiently capable GPU. No flag required. (Current stable is Chrome 150, July 2026.)
- Earlier Canary builds (Chrome 146–147) ran multimodal behind a flag before it stabilized in 148.
- Image input is **not** supported on iOS, Android, or ChromeOS at the time of writing.
- Audio input is a separate capability — currently restricted to discrete GPUs.

### Setup Instructions

On stable Chrome 148+ there is nothing to configure. On Canary, if multimodal isn't yet available, enable:

```
chrome://flags/#prompt-api-for-gemini-nano-multimodal-input
```

Set to **Enabled** and restart. Confirm with `await LanguageModel.availability({ expectedInputs: [{ type: 'image' }] })`.

### Checking Multimodal Availability

```javascript
// Returns one of: "available", "downloadable", "downloading", "unavailable"
const status = await LanguageModel.availability({
  expectedInputs: [{ type: "image" }]
});

if (status === "unavailable") {
  console.warn("Multimodal image input not available in this browser");
}
```

### Audio Input

`LanguageModel` also accepts **audio** input parts. Pass `{ type: 'audio' }` in `expectedInputs`, then send an `AudioBuffer`, `Blob`, or `ArrayBuffer` as an audio content part. Audio input **requires a GPU** and has its own availability, so probe it separately from image:

```javascript
// Audio availability is independent of image availability.
const audioStatus = await LanguageModel.availability({
  expectedInputs: [{ type: "audio" }]
});

const session = await LanguageModel.create({
  expectedInputs: [{ type: "text" }, { type: "audio" }]
});

const stream = session.promptStreaming([
  {
    role: "user",
    content: [
      { type: "text", value: "Transcribe and summarize this clip." },
      { type: "audio", value: audioBlob }   // AudioBuffer | Blob | ArrayBuffer
    ]
  }
]);
```

Output is always text. Keep audio on its own session so a device without a GPU still gets full image support.

Older Canary builds that predate the `expectedInputs` overload may throw rather than return `"unavailable"`. Guard with `try/catch` if you need to support those:

```javascript
async function getMultimodalAvailability() {
  if (typeof LanguageModel === "undefined") return "unavailable";
  try {
    return await LanguageModel.availability({
      expectedInputs: [{ type: "image" }]
    });
  } catch {
    return "unavailable";
  }
}
```

## Basic Usage

### Creating a Multimodal Session

```javascript
const session = await LanguageModel.create({
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "image" }
  ],
  expectedOutputs: [{ type: "text", languages: ["en"] }]
});
```

The session is just a regular `LanguageModel` — same `prompt()`, `promptStreaming()`, `destroy()` surface — but it knows up-front that prompts may contain images, which is what allows the runtime to load the vision tower.

### Asking About an Image

```javascript
const fileInput = document.querySelector("input[type=file]");
const blob = fileInput.files[0];

const answer = await session.prompt([
  {
    role: "user",
    content: [
      { type: "text", value: "What is in this image?" },
      { type: "image", value: blob }
    ]
  }
]);

console.log(answer);
```

### Streaming the Response

```javascript
const stream = session.promptStreaming([
  {
    role: "user",
    content: [
      { type: "text", value: "Describe this scene in one sentence." },
      { type: "image", value: blob }
    ]
  }
]);

const reader = stream.getReader();
let answer = "";
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  answer += value;
  render(answer);
}
```

`promptStreaming()` returns a `ReadableStream<string>` of incremental chunks. Each chunk is the next slice of new text — append, don't replace.

### Multiple Images in One Prompt

```javascript
const stream = session.promptStreaming([
  {
    role: "user",
    content: [
      { type: "text", value: "Which of these two photos has more bicycles?" },
      { type: "image", value: blob1 },
      { type: "image", value: blob2 }
    ]
  }
]);
```

Order matters — the model reads parts left to right.

## Accepted Image Inputs

The `value` of an `image` content part accepts any of the standard web image types. The runtime decodes whatever you pass internally.

| Input                  | When to use                                                       |
|------------------------|-------------------------------------------------------------------|
| `Blob` / `File`        | Drag-drop, clipboard paste, `<input type="file">`                 |
| `ImageBitmap`          | Pre-decoded images (cheap to re-use, ideal for live loops)        |
| `ImageData`            | Pixel arrays produced by `CanvasRenderingContext2D.getImageData`  |
| `HTMLImageElement`     | An `<img>` already on the page                                    |
| `HTMLCanvasElement`    | A 2D or WebGL canvas                                              |
| `HTMLVideoElement`     | A `<video>` element — current frame is captured                   |
| `OffscreenCanvas`      | Worker-rendered images                                            |
| `VideoFrame`           | WebCodecs-decoded frames                                          |

Behind the scenes the runtime resizes to its expected tile size; very large inputs are not faster than 512×512 inputs. Downsample yourself when you control the source (webcam, canvas) — see the live pattern below.

## Drag-Drop and Clipboard Paste

### Drag-Drop

```javascript
const dropZone = document.querySelector("#drop");

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file?.type.startsWith("image/")) return;
  attachImage(file); // file is a Blob — pass straight to prompt()
});
```

### Clipboard Paste

```javascript
document.addEventListener("paste", (e) => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) {
      attachImage(item.getAsFile()); // Blob
      return;
    }
  }
});
```

Both paths produce a `Blob` — no special handling is needed before passing to `prompt()`.

## Webcam Capture

### Single-Frame Snap

```javascript
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: { ideal: 640 }, height: { ideal: 480 } }
});

const video = document.querySelector("video");
video.srcObject = stream;
await video.play();

// User clicks "Capture"
const canvas = document.createElement("canvas");
canvas.width = video.videoWidth;
canvas.height = video.videoHeight;
canvas.getContext("2d").drawImage(video, 0, 0);

canvas.toBlob(async (blob) => {
  if (!blob) return;
  // Stop the camera now that we've grabbed a frame.
  for (const track of stream.getTracks()) track.stop();
  attachImage(blob);
}, "image/jpeg", 0.9);
```

### Continuous Live Mode

For a "talking-head" experience the page must capture a frame, send it to the model, and wait for the answer before capturing the next one. The pattern below keeps it cheap (downsample to 512×512), prevents pile-ups (single-in-flight gating), and reuses the model session across all frames.

```javascript
// One session, reused for every frame.
const session = await LanguageModel.create({
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "image" }
  ],
  expectedOutputs: [{ type: "text", languages: ["en"] }]
});

const stream = await navigator.mediaDevices.getUserMedia({ video: true });
const video = document.querySelector("video");
video.srcObject = stream;
await video.play();

let inFlight = false;
let stopped = false;
let abortController = null;

async function captureCycle() {
  if (stopped) return;
  if (inFlight) return;                            // gate — skip cycle

  // 1. Grab a single frame from the <video> via a hidden canvas.
  const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight);
  canvas.getContext("2d").drawImage(video, 0, 0);
  const fullBitmap = await createImageBitmap(canvas);

  // 2. Downsample to 512x512 — vision tower's expected tile size.
  const downsampled = await createImageBitmap(fullBitmap, {
    resizeWidth: 512,
    resizeHeight: 512
  });
  fullBitmap.close();

  // 3. Prompt the (reused!) session.
  inFlight = true;
  abortController = new AbortController();
  const t0 = performance.now();

  try {
    const replyStream = session.promptStreaming(
      [{
        role: "user",
        content: [
          { type: "text", value: "What do you see?" },
          { type: "image", value: downsampled }
        ]
      }],
      { signal: abortController.signal }
    );

    // Close the bitmap once it's been handed off — frees ~1 MB per frame.
    downsampled.close();

    const reader = replyStream.getReader();
    let response = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      response += value;
      renderLive(response);
    }
    console.log("frame latency:", Math.round(performance.now() - t0), "ms");
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  } finally {
    inFlight = false;
  }
}

const intervalId = setInterval(captureCycle, 3000);

function stopLive() {
  stopped = true;
  clearInterval(intervalId);
  abortController?.abort();
  for (const track of stream.getTracks()) track.stop();
}
```

The three load-bearing tricks:

1. **Downsample before prompting.** A raw 1280×720 webcam frame and a 512×512 downsampled frame produce the same answer; the smaller one runs roughly 4× faster.
2. **Single-in-flight gating.** Wrap every cycle in an `inFlight` boolean. If a frame is still being answered when the next 3-second tick fires, drop it. Without this, slow GPUs queue requests until the page is unresponsive.
3. **Session reuse.** Create one `LanguageModel` outside the loop. Recreating per frame loses ~300 ms warm-up each time and burns memory.

### Camera Permission Errors

```javascript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
} catch (e) {
  if (e.name === "NotAllowedError")     show("Camera blocked — enable in browser settings");
  else if (e.name === "NotFoundError")  show("No camera detected");
  else if (e.name === "NotReadableError") show("Camera in use by another application");
  else show("Camera error: " + e.message);
}
```

Surface these as inline UI cards, not `alert()`s — they need to be dismissible.

## Download Progress

The first multimodal `create()` triggers a model download if Gemini Nano isn't already on disk. Wire up `monitor` to show progress:

```javascript
const session = await LanguageModel.create({
  expectedInputs: [{ type: "text" }, { type: "image" }],
  expectedOutputs: [{ type: "text" }],
  monitor(m) {
    m.addEventListener("downloadprogress", (e) => {
      console.log(`Downloaded ${Math.round(e.loaded * 100)}%`);
    });
  }
});
```

`e.loaded` is a fraction between 0 and 1. At least two events (0% and 100%) are guaranteed.

## Error Handling

```javascript
try {
  const answer = await session.prompt(parts);
  render(answer);
} catch (e) {
  if (e instanceof DOMException) {
    if (e.name === "AbortError") return;
    if (e.name === "QuotaExceededError") {
      console.error("Too many tokens — shorten the prompt or attach fewer images");
    }
    if (e.name === "NotSupportedError") {
      console.error("This input combination is not supported in this build");
    }
  }
  console.error(e);
}
```

## Cancellation

```javascript
const controller = new AbortController();
stopButton.addEventListener("click", () => controller.abort());

const reply = await session.prompt(parts, { signal: controller.signal });
```

Aborting rejects the in-flight call. The session stays usable.

To free the model:

```javascript
session.destroy();
```

This unsubscribes the vision tower and lets the user agent reclaim memory.

## Best Practices

1. **One session per page.** Hold a module-scope `Promise<LanguageModel>` and reuse it. Don't create-per-prompt.
2. **Downsample webcam frames to 512×512.** Faster inference, less memory, no visible quality loss for typical "what do you see" prompts.
3. **Gate live-mode cycles.** Always wrap the per-frame call in a single-in-flight boolean. Without it, slow GPUs pile up requests.
4. **Close `ImageBitmap`s.** Once you've passed a bitmap to `prompt()` and it has returned, call `.close()`. They are large (~ width × height × 4 bytes) and not garbage-collected eagerly.
5. **Stop the `MediaStream` on teardown.** Looping `for (const track of stream.getTracks()) track.stop()` is the only way to release the camera light and the camera device.
6. **Surface availability up front.** Call `LanguageModel.availability({ expectedInputs: [{ type: 'image' }] })` on mount and render a flag-setup card when it returns `"unavailable"`.
7. **Render incrementally.** `promptStreaming()` makes the answer feel responsive — append each chunk into the same element rather than waiting for the full reply.

## Using with TypeScript

```typescript
interface MultimodalContentPart {
  type: "text" | "image";
  value: string | Blob | ImageBitmap | ImageData | HTMLImageElement |
         HTMLCanvasElement | HTMLVideoElement | OffscreenCanvas | VideoFrame;
}

interface PromptMessage {
  role: "user" | "assistant" | "system";
  content: MultimodalContentPart[];
}

const session = await LanguageModel.create({
  expectedInputs: [
    { type: "text", languages: ["en"] },
    { type: "image" }
  ],
  expectedOutputs: [{ type: "text", languages: ["en"] }]
});

const stream: ReadableStream<string> = session.promptStreaming([
  {
    role: "user",
    content: [
      { type: "text", value: "Describe this." },
      { type: "image", value: blob }
    ]
  }
]);
```

## Conclusion

Multimodal mode is a one-option upgrade to the regular `LanguageModel` API — pass `expectedInputs: [{ type: 'image' }]` at create-time and your prompts become arrays of content parts. Drag-drop, paste, and single-frame webcam capture are essentially the same call shape with a different image source. The only place that needs real engineering is continuous webcam capture, where downsample + single-in-flight + session reuse together unlock a sustained ~ 3-second cycle on consumer hardware.
