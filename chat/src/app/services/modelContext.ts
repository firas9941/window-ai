// Single source of truth for resolving the WebMCP entry point.
//
// Chrome 150 deprecated `navigator.modelContext` and moved the API to
// `document.modelContext` (WebMCP tools are per-Document). It will be removed
// from `navigator` in a future release. Prefer `document`, fall back to
// `navigator` so the demos keep working on Chrome 146–149.
//
// Official migration guidance:
// https://developer.chrome.com/docs/ai/webmcp/imperative-api
//   const modelContext = document.modelContext || navigator.modelContext;
//
// `ModelContext` is ambient (chat/src/app/types/webmcp.d.ts).

/**
 * Returns the active WebMCP `ModelContext`, preferring the Chrome 150+
 * `document.modelContext` over the deprecated `navigator.modelContext`.
 * Returns `undefined` when WebMCP is unavailable (no flag / older browser /
 * non-secure context). SSR-safe — guards `typeof document`/`navigator`.
 */
export function getModelContext(): ModelContext | undefined {
  if (typeof document !== 'undefined' && document.modelContext) {
    return document.modelContext;
  }
  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return navigator.modelContext;
  }
  return undefined;
}

/** Convenience boolean: is WebMCP available in this runtime? */
export function isModelContextAvailable(): boolean {
  return getModelContext() !== undefined;
}

/**
 * Registers a WebMCP tool, swallowing the intentional teardown rejection.
 *
 * `registerTool` is typed `void` (per spec), but Chrome's implementation returns
 * a Promise bound to the registration's lifetime that REJECTS with `AbortError`
 * when `options.signal` aborts (React unmount / StrictMode / HMR). Nothing awaits
 * that promise, so on `controller.abort()` it surfaces as an
 * "Uncaught (in promise) AbortError: signal is aborted without reason". We attach
 * a `.catch` that ignores AbortError (intentional) and logs anything else.
 *
 * A SYNCHRONOUS throw (e.g. "Duplicate tool name") still propagates to the caller,
 * so existing per-tool try/catch handling is unchanged. No-op on builds where
 * `registerTool` returns `void`.
 */
export function registerToolSafely(
  modelContext: ModelContext,
  tool: ModelContextTool,
  options?: ModelContextRegisterToolOptions,
): void {
  const result = modelContext.registerTool(tool, options) as unknown;
  if (result != null && typeof (result as { then?: unknown }).then === 'function') {
    (result as Promise<unknown>).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // eslint-disable-next-line no-console
      console.error('[WebMCP] registerTool rejected:', err);
    });
  }
}
