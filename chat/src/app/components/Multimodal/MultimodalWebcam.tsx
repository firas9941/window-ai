import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type PageState } from './MultimodalPage';
import { promptWithImage } from '../../services/MultimodalService';

// ---------------------------------------------------------------------------
// Props contract (locked by 11-CONTEXT.md § Component Layout)
// ---------------------------------------------------------------------------

export interface MultimodalWebcamProps {
  pageState: PageState;
  livePrompt: string; // textarea text from parent (or '' for empty)
  onFrameAttach: (blob: Blob) => void; // single-frame path — parent calls setPendingImage
  setIsLiveActive: (b: boolean) => void; // notifies parent so textarea + send button disabled
  /** Called at the START of each new live frame. Receives the captured Blob and the
   *  prompt text used for this frame. Parent appends a new user + empty assistant
   *  message pair to the transcript and returns the assistant streamingId so the
   *  subsequent onLiveChunk calls can target the right bubble. */
  onLiveFrame: (blob: Blob, prompt: string) => string;
  /** Called once per streamed chunk for the assistant message with the given id. */
  onLiveChunk: (streamingId: string, chunk: string) => void;
  /** Optional controls rendered at the START of the tools row (e.g. an Upload button). */
  leadingTools?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Local types — NOT exported
// ---------------------------------------------------------------------------

type WebcamMode = 'idle' | 'preview' | 'live' | 'error';
type WebcamErrorState = 'blocked' | 'no-camera' | 'in-use' | 'unknown' | null;

// ---------------------------------------------------------------------------
// getUserMedia constraints — locked by 11-CONTEXT.md § getUserMedia
// ---------------------------------------------------------------------------
const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
  audio: false,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MultimodalWebcam: React.FC<MultimodalWebcamProps> = ({
  pageState,
  livePrompt,
  onFrameAttach,
  setIsLiveActive,
  onLiveFrame,
  onLiveChunk,
  leadingTools,
}) => {
  // ---------------------------------------------------------------------------
  // Refs — non-reactive state (no re-render on change)
  // ---------------------------------------------------------------------------
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCaptureRef = useRef<ImageCapture | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Stale-closure safety for livePrompt inside setInterval (RESEARCH Pitfall 5)
  const livePromptRef = useRef<string>(livePrompt);

  // ---------------------------------------------------------------------------
  // State — render-driving values only
  // ---------------------------------------------------------------------------
  const [mode, setMode] = useState<WebcamMode>('idle');
  const [errorState, setErrorState] = useState<WebcamErrorState>(null);
  // WR-02: stores the original err.message for 'unknown' error cards (truncated to 80 chars)
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [wasSkipped, setWasSkipped] = useState<boolean>(false);
  // Set true on <video onLoadedMetadata> — guards handleCapture from 0×0 canvas (Pitfall 7)
  const [captureReady, setCaptureReady] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Effect: mirror livePrompt into ref to prevent stale closure in setInterval
  // (RESEARCH Pattern 5 — setInterval captures closure at creation time)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    livePromptRef.current = livePrompt;
  }, [livePrompt]);

  // ---------------------------------------------------------------------------
  // Ref + Effect: mirror pageState into ref — same stale-closure fix as livePromptRef
  // (CR-01: setInterval captures captureCycle once; pageState changes after that
  // are invisible to the running interval without a ref mirror — RESEARCH Pitfall 8)
  // ---------------------------------------------------------------------------
  const pageStateRef = useRef<PageState>(pageState);
  useEffect(() => {
    pageStateRef.current = pageState;
  }, [pageState]);

  // ---------------------------------------------------------------------------
  // Effect: attach the MediaStream to the <video> element when mode enters preview/live.
  // The <video> only renders when mode ∈ {'preview', 'live'}, so videoRef.current is null
  // at the moment handleTakePhoto/handleLiveModeStart finishes getUserMedia. Wire the
  // stream here on the next render, once both the ref and the stream exist.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if ((mode === 'preview' || mode === 'live') && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      // play() can reject if the element is unmounted mid-call; swallow that.
      void videoRef.current.play().catch(() => {
        /* play() rejects if unmounted mid-call — safe to ignore */
      });
    }
  }, [mode]);

  // ---------------------------------------------------------------------------
  // Effect: single cleanup on unmount — StrictMode safe (no async work on mount;
  // camera is requested only on user click so double-invoke is a no-op on null refs)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      // Stop MediaStream tracks — Pitfall 2: camera light stays on without this
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      imageCaptureRef.current = null;
      // Cancel in-flight prompt
      abortControllerRef.current?.abort();
      // Clear live-mode interval
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      inFlightRef.current = false;
    };
  }, []); // empty deps — cleanup-only effect, matches Phase 10 Plan 02 pattern

  // ---------------------------------------------------------------------------
  // Helper: stop MediaStream and null both stream + imageCapture refs together
  // (RESEARCH Pattern 6 + Pitfall — imageCaptureRef must also be nulled)
  // ---------------------------------------------------------------------------
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    imageCaptureRef.current = null; // prevent stale grabFrame() call on dead track
  }, []);

  // ---------------------------------------------------------------------------
  // Helper: map getUserMedia DOMException to WebcamErrorState
  // (CONTEXT.md § Permission / Error Handling — locked mapping)
  // ---------------------------------------------------------------------------
  const mapMediaError = useCallback((err: unknown): WebcamErrorState => {
    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError') return 'blocked';
      if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'no-camera';
      if (err.name === 'NotReadableError') return 'in-use';
      return 'unknown';
    }
    return 'unknown';
  }, []);

  // ---------------------------------------------------------------------------
  // Handler: copy chrome:// URL to clipboard (error card — blocked variant)
  // ---------------------------------------------------------------------------
  const handleCopyChromeUrl = useCallback(() => {
    // WR-03: .catch() prevents unhandled rejection when clipboard access is denied
    // The <code> text is still copyable via standard browser text selection + copy.
    navigator.clipboard.writeText('chrome://settings/content/camera').catch(() => {
      /* clipboard API unavailable or denied — silent fallback */
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Handler: dismiss error card — returns to idle mode
  // ---------------------------------------------------------------------------
  const handleDismissError = useCallback(() => {
    setErrorState(null);
    setErrorMessage(null);
    setMode('idle');
  }, []);

  // ---------------------------------------------------------------------------
  // Handler: single-frame capture — "Take photo" button
  // Requests camera only on user click (never on mount — CONTEXT.md locked)
  // ---------------------------------------------------------------------------
  const handleTakePhoto = useCallback(async () => {
    setCaptureReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
      streamRef.current = stream;
      // Stream is attached to <video> by the mode-watching useEffect below — at this
      // point videoRef.current is still null (video element only renders when mode='preview').
      setMode('preview');
    } catch (err) {
      const mapped = mapMediaError(err);
      setErrorState(mapped);
      // WR-02: preserve err.message for 'unknown' variant so the card body is informative
      setErrorMessage(mapped === 'unknown' && err instanceof Error ? err.message.slice(0, 80) : null);
      setMode('error');
    }
  }, [mapMediaError]);

  // ---------------------------------------------------------------------------
  // Handler: capture single frame — "Capture" button in preview overlay
  // Pitfall 7: guard against 0×0 canvas when video not yet loaded
  // Pitfall 3: canvas.toBlob() callback may return null — always null-check
  // ---------------------------------------------------------------------------
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Pitfall 7: guard against 0×0 canvas (captureReady is belt-and-suspenders)
    if (!video.videoWidth || !video.videoHeight) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions to actual video dimensions before drawing
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // canvas.toBlob is void/callback (TS 5.9.2 lib.dom.d.ts) — NOT a Promise
    canvas.toBlob(
      (blob) => {
        // Pitfall 3: blob can be null — null-check before invoking onFrameAttach
        if (blob) {
          onFrameAttach(blob);
          stopStream();
          setMode('idle');
          setCaptureReady(false);
        } else {
          // JPEG encoder returned null — surface an error card instead of silent failure (WR-01)
          console.warn('[MultimodalWebcam] canvas.toBlob returned null');
          stopStream();
          setErrorState('unknown');
          setMode('error');
          setCaptureReady(false);
        }
      },
      'image/jpeg',
      0.92,
    );
  }, [onFrameAttach, stopStream]);

  // ---------------------------------------------------------------------------
  // Handler: cancel preview — "Cancel" button
  // ---------------------------------------------------------------------------
  const handleCancel = useCallback(() => {
    stopStream();
    setMode('idle');
    setCaptureReady(false);
  }, [stopStream]);

  // ---------------------------------------------------------------------------
  // captureCycle: called by setInterval every 3000ms during live mode
  // All 8 RESEARCH pitfalls addressed here.
  // ---------------------------------------------------------------------------
  const captureCycle = useCallback(async () => {
    // Pitfall 8: guard pageState via ref — reads current value even though setInterval
    // captured this callback at live-mode start (CR-01 fix — Pitfall 8 / RESEARCH Pattern 5)
    if (pageStateRef.current !== 'ready') return;

    // Single-in-flight gating (CONTEXT.md § Live Mode Loop — locked)
    if (inFlightRef.current) {
      setWasSkipped(true);
      setTimeout(() => setWasSkipped(false), 500);
      return;
    }

    inFlightRef.current = true;
    const t0 = performance.now();

    try {
      // Read current frame directly from the live <video> element via the hidden <canvas>.
      // Bypasses ImageCapture.grabFrame() (returns detached bitmaps on some Chrome/driver
      // combos) AND OffscreenCanvas (had compatibility issues with drawImage(video) on
      // this build). The same hidden canvas is used by single-frame capture (handleCapture),
      // so the pattern is proven.
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        inFlightRef.current = false;
        return;
      }
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        // HAVE_CURRENT_DATA (2) is the minimum for drawImage. Skip silently if not yet ready.
        inFlightRef.current = false;
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      canvas.width = 512;
      canvas.height = 512;
      ctx.drawImage(video, 0, 0, 512, 512);

      // Output as JPEG Blob — promptWithImage accepts Blob | ImageBitmap; Blob is simpler
      // (no bitmap lifecycle management) and matches the single-frame capture path.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Canvas toBlob returned null');

      // Pitfall 5: read prompt from ref, not closure (stale closure prevention)
      const promptText = livePromptRef.current.trim() || 'Describe what you see in this image';

      // Notify parent that a new frame is starting — parent appends user + empty
      // assistant messages to the transcript and returns the assistant streamingId
      // so the subsequent chunks land in the right bubble.
      const streamingId = onLiveFrame(blob, promptText);

      const stream = await promptWithImage(promptText, blob, {
        signal: abortControllerRef.current?.signal,
      });

      // Pitfall 1 (from Phase 10): use reader.read() loop, NOT for-await
      // reader.releaseLock() in finally prevents unhandled rejection on abort
      const reader = stream.getReader();
      let firstChunk = true;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (firstChunk) {
            // POLISH-02: time-to-first-token latency measurement
            setLastLatencyMs(Math.round(performance.now() - t0));
            firstChunk = false;
          }
          onLiveChunk(streamingId, value);
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      // AbortError = intentional cancel (toggle-off or unmount) — swallow silently
      // (PATTERNS AbortError pattern — live mode was intentionally stopped)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      // Non-abort errors: log, then tear down live mode to stop the interval.
      // Without this the loop keeps firing every 3 s with the same broken state (CR-02).
      console.error('[MultimodalWebcam] captureCycle error:', err);
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      abortControllerRef.current?.abort();
      stopStream();
      inFlightRef.current = false;
      setIsLiveActive(false);
      setMode('idle');
    } finally {
      inFlightRef.current = false;
    }
  // pageState removed from deps — read via pageStateRef.current instead (CR-01)
  // stopStream + setIsLiveActive added — used in CR-02 error teardown path
  }, [onLiveFrame, onLiveChunk, stopStream, setIsLiveActive]);

  // ---------------------------------------------------------------------------
  // Handler: start live mode — "Live mode" button
  // Pitfall 6: create FRESH AbortController — never reuse an aborted one
  // ---------------------------------------------------------------------------
  const handleLiveModeStart = useCallback(async () => {
    setLastLatencyMs(null);
    setWasSkipped(false);
    setCaptureReady(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
      streamRef.current = stream;

      // Build ImageCapture from first video track (live mode only)
      imageCaptureRef.current = new ImageCapture(stream.getVideoTracks()[0]);

      // Stream is attached to <video> by the mode-watching useEffect below — at this
      // point videoRef.current is still null (video element only renders when mode='live').

      // Pitfall 6: create FRESH AbortController — never reuse (signal.aborted is permanent)
      abortControllerRef.current = new AbortController();

      // Start 3000ms interval loop
      intervalRef.current = setInterval(captureCycle, 3000);

      setIsLiveActive(true);
      setMode('live');
    } catch (err) {
      const mapped = mapMediaError(err);
      setErrorState(mapped);
      // WR-02: preserve err.message for 'unknown' variant so the card body is informative
      setErrorMessage(mapped === 'unknown' && err instanceof Error ? err.message.slice(0, 80) : null);
      setMode('error');
    }
  }, [captureCycle, setIsLiveActive, mapMediaError]);

  // ---------------------------------------------------------------------------
  // Handler: stop live mode — "Stop live" button
  // NOTE: do NOT clear lastLatencyMs here so last value lingers briefly on restart
  // ---------------------------------------------------------------------------
  const handleLiveModeStop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    abortControllerRef.current?.abort();
    stopStream();
    inFlightRef.current = false;
    setIsLiveActive(false);
    setMode('idle');
  }, [stopStream, setIsLiveActive]);

  // ---------------------------------------------------------------------------
  // Derived: is live mode currently active (button state + disabled conditions)
  // ---------------------------------------------------------------------------
  const isLive = mode === 'live';
  const isPreview = mode === 'preview';
  const isError = mode === 'error';
  const isIdle = mode === 'idle';

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------
  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* Tools row — always rendered                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {leadingTools}
        {/* "Take photo" pill button */}
        <button
          onClick={handleTakePhoto}
          disabled={!isIdle || pageState !== 'ready'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
        >
          {/* Camera SVG icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Take photo
        </button>

        {/* "Live mode" / "Stop live" toggle pill button */}
        <button
          onClick={isLive ? handleLiveModeStop : handleLiveModeStart}
          disabled={isPreview || pageState !== 'ready'}
          className={[
            'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium',
            'disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800',
            isLive
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
          ].join(' ')}
        >
          {/* Red circle SVG icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-3 h-3"
            viewBox="0 0 24 24"
            fill={isLive ? 'currentColor' : '#ef4444'}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
          </svg>
          {isLive ? 'Stop live' : 'Live mode'}
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Video preview slot — shown in preview or live mode                  */}
      {/* ------------------------------------------------------------------ */}
      {(isPreview || isLive) && (
        <div className="relative w-60 h-44 mb-2 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover animate-fade-in"
            autoPlay
            muted
            playsInline
            aria-label="Webcam live preview"
            onLoadedMetadata={() => setCaptureReady(true)}
          />

          {/* Capture / Cancel overlay — preview mode only */}
          {isPreview && (
            <div className="absolute inset-0 flex items-end justify-center gap-3 pb-3 bg-black/20">
              <button
                onClick={handleCapture}
                disabled={!captureReady}
                className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Capture
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Perf badge — live mode only, bottom-right (POLISH-02, CONTEXT.md locked classes) */}
          {isLive && (
            <div
              className="absolute bottom-2 right-2 bg-black/70 text-white text-xs font-medium px-2 py-1 rounded"
              aria-live="off"
            >
              {wasSkipped
                ? '3s interval · skipped (in flight)'
                : lastLatencyMs === null
                  ? '3s interval · …'
                  : `3s interval · last: ${lastLatencyMs} ms`}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Error card slot — replaces video preview slot when mode === 'error' */}
      {/* ------------------------------------------------------------------ */}
      {isError && errorState !== null && (
        <div className="w-60 mb-2 p-4 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 relative animate-fade-in">
          {/* Dismiss × button */}
          <button
            onClick={handleDismissError}
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            aria-label="Dismiss camera error"
          >
            ×
          </button>

          {/* Icon + heading row */}
          <div className="flex items-center gap-2 mb-1 pr-8">
            {errorState === 'blocked' && (
              <>
                {/* Camera-slash SVG */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Camera blocked
                </span>
              </>
            )}
            {errorState === 'no-camera' && (
              <>
                {/* Exclamation-circle SVG */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  No camera detected
                </span>
              </>
            )}
            {errorState === 'in-use' && (
              <>
                {/* Lock-closed SVG */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Camera in use
                </span>
              </>
            )}
            {errorState === 'unknown' && (
              <>
                {/* Exclamation-triangle SVG */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Camera error
                </span>
              </>
            )}
          </div>

          {/* Error body copy */}
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-1">
            {errorState === 'blocked' && (
              <>
                <p>Enable in browser settings</p>
                {/* chrome:// URL as <code> copy element — NOT <a href="chrome://..."> */}
                {/* Browser blocks JS navigation to chrome:// — copy pattern from MissingFlagBanner */}
                <code
                  className="block mt-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-2 py-1 rounded font-mono text-xs cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  onClick={handleCopyChromeUrl}
                  title="Click to copy"
                  aria-label="Copy chrome://settings/content/camera to clipboard"
                >
                  chrome://settings/content/camera
                </code>
              </>
            )}
            {errorState === 'no-camera' && <p>Connect a camera and try again</p>}
            {errorState === 'in-use' && <p>Close other apps using the camera and try again</p>}
            {errorState === 'unknown' && <p>{errorMessage ?? 'Unknown camera error'}</p>}
          </div>
        </div>
      )}

      {/* Hidden canvas — used by handleCapture for single-frame JPEG encoding */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
};
